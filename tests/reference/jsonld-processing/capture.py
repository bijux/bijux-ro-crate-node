"""Capture fixed whole inputs with a role-scoped, hash-bound graph correction."""
import argparse
import contextlib
import hashlib
import io
import json
from pathlib import Path
import runpy
import sys
from pyld import jsonld
from corrected import standard_metadata_graph

folder = Path(__file__).parent
root = folder.parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--corrected', action='store_true')
parser.add_argument('--counterparts', action='store_true')
args = parser.parse_args()
assert not (args.corrected and args.counterparts)
source = folder / ('propagation-counterparts.json' if args.counterparts else 'inputs.json')
contract = json.loads((folder / 'contract.json').read_text())
assert hashlib.sha256((folder / 'inputs.json').read_bytes()).hexdigest() == contract['inputs_sha256']
assert hashlib.sha256((folder / 'propagation-counterparts.json').read_bytes()).hexdigest() == contract['counterparts_sha256']
request = json.load(sys.stdin)
encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
assert encode(request) == encode(json.loads(source.read_text())), 'Exact registered inputs and order required'
if args.corrected:
    request = {'cases': [item for item in request['cases'] if not item['name'].startswith('jsonld-context/remote-local/')]}
    assert len(request['cases']) == 72
sys.path.insert(0, str(root / 'tests/parity'))
oracle = runpy.run_path(str(root / 'tests/parity/oracle.py'))
mode = standard_metadata_graph(oracle) if args.corrected else contextlib.nullcontext(None)
sys.stdin = io.StringIO(encode(request))
output = io.StringIO()
with mode as stamp, contextlib.redirect_stdout(output):
    oracle['main']()
result = json.loads(output.getvalue())
result['reference_paths'] = {'pyld_module': str(Path(jsonld.__file__).resolve())}
if stamp:
    result['jsonld_graph_correction'] = {**stamp,
        'capture_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'correction_sha256': hashlib.sha256((folder / 'corrected.py').read_bytes()).hexdigest(),
        'inputs_sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
print(json.dumps(result))
