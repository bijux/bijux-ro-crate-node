"""Capture exact original or independently corrected complete observer outcomes."""
import argparse
import contextlib
import hashlib
import io
import json
from pathlib import Path
import runpy
import sys
from corrected import registered_request, reserved_type_graphs
folder = Path(__file__).parent
root = folder.parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('--corrected', action='store_true')
args = parser.parse_args()
request = json.load(sys.stdin)
registered_request(request)
sys.path.insert(0, str(root / 'tests/parity'))
oracle = runpy.run_path(str(root / 'tests/parity/oracle.py'))
sys.stdin = io.StringIO(json.dumps(request))
output = io.StringIO()
mode = reserved_type_graphs(oracle, request) if args.corrected else contextlib.nullcontext(None)
with mode as stamp, contextlib.redirect_stdout(output):
    oracle['main']()
result = json.loads(output.getvalue())
if stamp:
    result['reserved_type_correction'] = {**stamp,
        'capture_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'correction_sha256': hashlib.sha256((folder / 'corrected.py').read_bytes()).hexdigest()}
print(json.dumps(result))
