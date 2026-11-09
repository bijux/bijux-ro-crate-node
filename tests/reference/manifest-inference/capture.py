"""Capture exact original or independently corrected manifest inference cases."""
import argparse
import contextlib
import hashlib
import io
import json
from pathlib import Path
import runpy
import sys
from rules import corrected_manifest_reads, correction_receipt, installed_integrity

folder = Path(__file__).parent
root = folder.parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--corrected', action='store_true')
parser.add_argument('--integrity-output', required=True, type=Path)
args = parser.parse_args()
request = json.load(sys.stdin)
registered = json.loads((folder / 'inputs.json').read_text())
encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'))
assert encode(request) == encode(registered), 'Manifest capture requires all exact registered inputs'
sys.stdin = io.StringIO(encode(request))
sys.path.insert(0, str(root / 'tests/parity'))
output = io.StringIO()
if args.corrected:
    with corrected_manifest_reads() as integrity, contextlib.redirect_stdout(output):
        runpy.run_path(str(root / 'tests/parity/oracle.py'), run_name='__main__')
else:
    integrity = {'before': installed_integrity()}
    with contextlib.redirect_stdout(output):
        runpy.run_path(str(root / 'tests/parity/oracle.py'), run_name='__main__')
    assert installed_integrity() == integrity['before']
capture = json.loads(output.getvalue())
if args.corrected:
    capture['manifest_correction'] = {**correction_receipt(),
        'capture_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
args.integrity_output.parent.mkdir(parents=True, exist_ok=True)
args.integrity_output.write_text(json.dumps(integrity, indent=2) + '\n')
print(json.dumps(capture))
