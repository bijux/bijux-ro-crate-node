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
