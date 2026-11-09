"""Capture the pinned key rule and its isolated final-property correction."""
import argparse
import contextlib
import hashlib
import io
import json
import runpy
import sys
from pathlib import Path
from rules import corrected_key_rule, correction_receipt

folder = Path(__file__).parent
root = folder.parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--corrected', action='store_true')
args = parser.parse_args()
receipt = correction_receipt()
if args.corrected:
    request = json.load(sys.stdin)
    registered = json.loads((folder / 'inputs.json').read_text())
    encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    assert encode(request) == encode(registered), 'Key correction requires the complete registered inputs'
    sys.stdin = io.StringIO(encode(request))
sys.path.insert(0, str(root / 'tests/parity'))
if args.corrected:
    output = io.StringIO()
    with corrected_key_rule(), contextlib.redirect_stdout(output):
        runpy.run_path(str(root / 'tests/parity/oracle.py'), run_name='__main__')
    capture = json.loads(output.getvalue())
    capture['key_correction'] = {**receipt,
        'capture_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    print(json.dumps(capture))
else:
    runpy.run_path(str(root / 'tests/parity/oracle.py'), run_name='__main__')
