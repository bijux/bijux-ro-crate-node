"""Capture URL normalization and component diagnostics from locked Pydantic."""
from importlib.metadata import version
import json
from pathlib import Path
from pydantic import AnyUrl, TypeAdapter, ValidationError

assert version('pydantic-core') == '2.41.5'
adapter = TypeAdapter(AnyUrl)
values = [
    'http://host:bad/path', 'http://[::1]:bad', 'ftp://host:bad',
    'ws://host:bad/x', 'wss://host:65536/x', 'http://[foo]:bad/x',
    'http://[::1]:65536/x', 'http://exa mple:bad/x', 'http://999.999.999.999:bad/path',
    'http://999.999.999.999:80/path', 'http://user[abc]@host:bad/x', 'http:host:bad/x',
    'ftp:/host:bad/x', 'custom://host:bad/x', 'file://host:bad/x',
    'http://host:12x?x', 'http://host:-1/x', 'http://host:65536/x',
    'http://[::1', 'http://host/x[bad]', 'http://[::1]:12345678901234567890/x',
    'https://example.org/a', 'http://host:80/path', 'ftp://host:21/path',
    'http://[::1]:80/path', 'http://exa mple:bad/path', 'http://[foo]:bad/path',
    'http://:bad/path', 'http://host:/path', 'custom://host:80/path',
    'custom://host:bad/path', 'file://host:bad/path', 'file:///path',
    'http://host/path[bracket]', '', 'relative/path',
    None, 1,
]
values += ['http://[::1]extra:bad/path', 'custom://exa mple:bad/path',
           'custom://host[abc]:bad/path', 'file://[::1]:bad/path', 'file://:bad/path']
values += ['foo:\\\\a b', 'foo:/\\a b', 'http:\\\\a b', 'file:\\\\a b',
           'foo://a::80', 'http://a::80', 'http://exa mple::80',
           'foo://a:80:90', 'http://[::1]::80', 'foo://[::1]:80',
           'foo://a%00b/', 'foo://a%1Fb/', 'http://a%1Fb/']
values += [f'{scheme}://a{chr(point)}b/' for scheme in ('foo', 'http') for point in range(33)]
# Domain mapping follows the locked Unicode tables before URL parsing.
values += [f'{scheme}://{host}{port}/x'
           for scheme in ('http', 'https', 'ftp', 'ws', 'wss', 'file', 'foo')
           for host in ('a\u04c0b', 'a\u0870b', 'a\uffa0b', 'BÜCHER.de', 'xn--bcher-kva.de', '\u00ad', '\u200b')
           for port in ('', ':80', ':bad')]
values += ['http://user@a\u04c0b/x', 'http:a\u0870b/x', 'file://user@\u00ad/x',
           'file://C:/x', 'file://localhost/x', 'http://a%2fb:bad/x', 'http://%EF%BE%A0/x']
values += [f'{scheme}://{host}{suffix}'
           for scheme in ('http', 'https', 'ftp', 'ws', 'wss', 'file', 'foo')
           for host in ('example.org', 'BÜCHER.de')
           for suffix in ('/x?q=\\r#\\s', '\\x?q=\\r#\\s')]
# Pinned URL parsing preserves authority, opaque-host and file-drive boundaries.
values += [
    'http://xn--/', 'http://xn--.example/',
    'http://a.xn--.b/', 'http://xn--.:bad/',
    'http://\xadxn--.example/', 'http://ｘｎ－－.example/',
    'http://xn--%C2%AD.example/', 'http://a..b/',
    'http://./', 'http://０８/a',
    'http://０８:bad/a', 'http://%30%38/a',
    'file://０８/a', 'file://08/a',
    'file://08:bad/a', 'http://0x7f.1/a',
    'http://０x７f.１/a', 'file://C|/x',
    'file:///C|/x', 'file:///C|/../a',
    'file://host/C|/../a', 'file://host///C|/../a',
    'file:////C:/../a', 'file://///a//b',
    'file://host//a', 'file:///a//b',
    'file://localhost//a', 'file:////\xad/path',
    'file:///C|/../C%7C/a', 'file:///C%7C/../a',
    'foo://\u200d/x', 'foo://\u200d:80/x',
    'foo://\u200d:bad/x', 'foo://user%40pass@\u200d:80/x',
    'http://user%40pass@host/a', 'http://\xad@host/a',
    'http://user\\@host/a', 'http://a%5cb:bad/a',
    'file://user@host/a', 'file://host:80/a',
    'file://[::1]:80/a', 'file://[::1]/C|/a',
]
# Lone UTF-16 surrogates fail string decoding before URL syntax validation.
values += [
    'http://example.org/\ud800',
    'http://example.org/?q=\ud800',
    'http://example.org/#\ud800',
    'http://\ud800/',
    'foo:\ud800',
    'http://example.org/\udc00',
    'not-a-url\ud800',
    'http://example.org/\udc00\ud800',
    'http://example.org/🙂',
]
values += ['file://host/C:/a', 'file://host//C:/../a']
# Rust file paths retain drive roots even below an ordinary path segment.
values += [
    'file:host/c:/../a', 'file:host/c|/../a',
    'file:host/c:/../../a', 'file:host/c|/../../a',
    'file://host/x/C:/../a', 'file://host/x/C|/../a',
    'file://host/C:/../../a', 'file://host/C|/../../a',
    'file://localhost/C|/a', 'file://localhost//C|/a',
    'file:////host/C|/../a', 'file://host///C|/a',
    'file:C:foo', 'file:C|foo', 'file:C:foo/../a',
    'file://///x//C:/../a',
]
# File authorities keep literal at-signs when host errors are classified.
for value in ['file://[', 'file://@[', 'file://u@[', 'file://[@', 'file://[u@',
              'file://[::1]', 'file://u@[::1]', 'file://[::1]@', 'file://[::1]@host',
              'file://user@host', 'file://@host', 'file://[]', 'file://[x]',
              'file://[x]@', 'file://@[x]', 'file:///x', 'file://localhost/x',
              'http://u@[::1]', 'http://u@[', 'http://[@']:
    if value not in values:
        values.append(value)
cases = []
for value in values:
    try:
        expected = dict(value=str(adapter.validate_python(value)), errors=[])
    except ValidationError as error:
        expected = dict(errors=[{k: e[k] for k in ('loc', 'msg', 'type')} for e in error.errors()])
    cases.append(dict(name=f'URL {value!r}', input=value, expected=expected))
destination = Path(__file__).parents[1] / 'expected/url-cases.json'
destination.write_text(json.dumps(cases, indent=2) + '\n')
print(f'{len(cases)} Pydantic URL boundaries captured')
