"""Derive bounded language-tag construction controls from RFC 5646 ABNF."""
import hashlib
import json
from pathlib import Path
from language import GRANDFATHERED, well_formed

folder = Path(__file__).parent
values = ['en', 'EN-latn-US', 'de-CH-1901', 'zh-cmn-Hans-CN', 'x-private',
    'x-a-b', 'en-a-foo-b-bar', 'en-variant-variant', 'en-a-foo-a-bar',
    '', 'q', '@id', 'en_US', 'en--US', 'en-a', 'en-x', 'x', 'i-invalid',
    'en-US-US', 'en-Latn-Latn', 'abcd-efg', 'en-abc-def-ghi-jkl',
    'en-GB-oed-x-private', 'sgn-BE-FR-x-private', 'en-a-x-foo',
    'en-abcde', 'en-1abc', 'en-1ab', 'en-abcdefgh', 'en-abcdefghi',
    'en-123', 'en-12', 'en-1234', 'en-a-abcdefgh', 'en-a-abcdefghi',
    'en-x-abcdefgh', 'en-x-abcdefghi', 'en-İ', 'KK', 'i-Klingon', 'en-é',
    'en\n', ' en', 'en ', 'en\x00', 'en-a-foo-x-a-a']
for tag in sorted(GRANDFATHERED):
    values.extend([tag, tag.upper()])
for language in ['a', 'ab', 'abc', 'abcd', 'abcde', 'abcdefgh', 'abcdefghi', '12', 'x']:
    for suffix in ['', '-abc', '-abc-def-ghi', '-Latn-US', '-419', '-1901', '-abcde',
                   '-a-foo', '-a-foo-a-bar', '-x-a-b', '-x']:
        values.append(language + suffix)
for tag in ['en', 'zh-cmn', 'abcd', 'x-private']:
    for width in range(1, 10):
        for suffix in ['-' + 'a' * width, '-0-' + 'a' * width, '-x-' + 'a' * width]:
            values.append(tag + suffix)
for prefix in ['en', 'en-US', 'en-a-foo', 'x-private']:
    for ending in [chr(10), chr(13), chr(13) + chr(10), chr(0x2028), chr(0x2029), chr(0)]:
        values.append(prefix + ending)
values = list(dict.fromkeys(values))
print(json.dumps({'standard': 'https://www.rfc-editor.org/rfc/rfc5646#section-2.2.9',
    'boundary': 'ABNF well-formedness, not IANA registry validity',
    'grammar_sha256': hashlib.sha256((folder / 'language.py').read_bytes()).hexdigest(),
    'cases': [{'language': value, 'well_formed': well_formed(value)} for value in values]},
    ensure_ascii=False, indent=2))
