"""Capture the pinned Python string representation used in manifest diagnostics."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import unicodedata

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root / 'tests/parity/expected/manifest-formatting.json')
parser.add_argument('--write-runtime-data', action='store_true')
args = parser.parse_args()
subprocess.run([sys.executable, str(root / 'scripts/reference/verify-environment.py')],
               check=True, stdout=subprocess.DEVNULL)
ranges = []
digest = hashlib.sha256()
for code in range(0x110000):
    value = chr(code)
    digest.update((repr(value) + '\n').encode('utf-8'))
    if value.isprintable():
        continue
    if ranges and ranges[-1][1] == code - 1:
        ranges[-1][1] = code
    else:
        ranges.append([code, code])
data = {'unicode': unicodedata.unidata_version, 'ranges': ranges}
runtime = root / 'packages/validator/src/diagnostics/unicode-printability.json'
if args.write_runtime_data:
    runtime.write_text('{\n  "unicode": ' + json.dumps(data['unicode']) + ',\n  "ranges": [\n' +
                       ',\n'.join('    ' + json.dumps(item) for item in ranges) + '\n  ]\n}\n')
else:
    assert json.loads(runtime.read_text()) == data
samples = ["", "a'b", 'a"b', 'a\'"b', 'a\\b', 'a\tb', 'a\nb', 'a\rb', 'a\x00b',
           'a\u200db', 'a\u2028b', 'a\U000105c0b', 'é', '😀', '\ud800']
reference = json.loads((root / 'docs/compatibility/reference.json').read_text())
args.output.write_text(json.dumps({'reference': reference['commit'], 'python': platform.python_version(),
    'unicode': unicodedata.unidata_version, 'string_repr_sha256': digest.hexdigest(),
    'cases': [{'input': value, 'expected': repr(value)} for value in samples]}, indent=2) + '\n')
print(f'{len(ranges)} Unicode printability ranges and all-codepoint repr digest captured')
