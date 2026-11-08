"""Capture the locked Unicode predicates used by RDF names and Python word rules."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import re
import subprocess
import sys
import unicodedata

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root / 'tests/parity/expected/unicode-names.json')
parser.add_argument('--write-runtime-data', action='store_true')
args = parser.parse_args()
subprocess.run([sys.executable, str(root / 'scripts/reference/verify-environment.py')],
               check=True, stdout=subprocess.DEVNULL)
from rdflib.namespace import NAME_CATEGORIES, SPLIT_START_CATEGORIES

ranges = []
digest = hashlib.sha256()
word = re.compile(r'\w\Z')
for code in range(0x110000):
    character = chr(code)
    category = unicodedata.category(character)
    flags = ((1 if category in NAME_CATEGORIES else 0) |
             (2 if category in SPLIT_START_CATEGORIES else 0) |
             (4 if word.fullmatch(character) else 0))
    digest.update(f'{code}:{flags}\n'.encode('ascii'))
    if not flags:
        continue
    if ranges and ranges[-1][1] == code - 1 and ranges[-1][2] == flags:
        ranges[-1][1] = code
    else:
        ranges.append([code, code, flags])
data = {'unicode': unicodedata.unidata_version,
        'flags': {'rdf_name': 1, 'rdf_split_start': 2, 'python_word': 4}, 'ranges': ranges}
runtime = root / 'packages/validator/src/metadata/rdf/unicode-names.json'
if args.write_runtime_data:
    runtime.write_text('{\n  "unicode": ' + json.dumps(data['unicode']) + ',\n  "flags": ' + json.dumps(data['flags']) + ',\n  "ranges": [\n' +
                       ',\n'.join('    ' + json.dumps(item) for item in ranges) + '\n  ]\n}\n')
else:
    assert json.loads(runtime.read_text()) == data
reference = json.loads((root / 'docs/compatibility/reference.json').read_text())
args.output.write_text(json.dumps({'reference': reference['commit'], 'python': platform.python_version(),
    'unicode': unicodedata.unidata_version, 'codepoints': 0x110000,
    'predicates_sha256': digest.hexdigest()}, indent=2) + '\n')
print(f'{len(ranges)} combined Unicode name ranges and all-codepoint predicate digest captured')
