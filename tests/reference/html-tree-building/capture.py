"""Run the unchanged whole-parser oracle, with an explicit corrected dependency mode."""
import argparse
import contextlib
import hashlib
import io
import json
from pathlib import Path
import runpy
import subprocess
import sys
from corrected import corrected_grammar

root = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('--corrected', action='store_true')
args = parser.parse_args()
request_text = sys.stdin.read()
request = json.loads(request_text)
fixed_inputs = Path(__file__).with_name('inputs.json')
assert request == json.loads(fixed_inputs.read_text()), 'HTML correction is restricted to the explicit complete-case contracts'
sys.stdin = io.StringIO(request_text)
subprocess.run([sys.executable, str(root / 'scripts/reference/verify-environment.py')], check=True, stdout=subprocess.DEVNULL)
sys.path.insert(0, str(root / 'tests/parity'))
oracle_path = root / 'tests/parity/oracle.py'
(root / 'artifacts/work').mkdir(parents=True, exist_ok=True)
oracle = runpy.run_path(str(oracle_path))
output = io.StringIO()
mode = corrected_grammar() if args.corrected else contextlib.nullcontext(None)
sys.path.insert(0, str(root / 'tests/reference/competing-collections'))
from qualification import collection_qualification
collection_mode = collection_qualification(oracle, request, fixed_inputs) if args.corrected else contextlib.nullcontext(None)
with mode as stamp, collection_mode as collection_stamp, contextlib.redirect_stdout(output):
    oracle['main']()
result = json.loads(output.getvalue())
if stamp is not None:
    assert all(row['status'] in {'valid', 'invalid'} for row in result['cases']), 'HTML qualification interrupted by a parser or instrumentation exception'
    result['collection_qualification'] = collection_stamp
    stamp['inputs_sha256'] = hashlib.sha256(fixed_inputs.read_bytes()).hexdigest()
    stamp['oracle_sha256'] = hashlib.sha256(oracle_path.read_bytes()).hexdigest()
    stamp['capture_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    result['html_grammar_correction'] = stamp
print(json.dumps(result))
