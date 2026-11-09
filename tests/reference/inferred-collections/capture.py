"""Capture unchanged Python or isolated finite complete-LIST rule relations."""
import argparse
import contextlib
import hashlib
import inspect
import io
import json
import runpy
import sys
from importlib.metadata import version
from pathlib import Path
from rdflib import Graph
from owlrl import OWLRL_Semantics

root = Path(__file__).resolve().parents[3]
folder = Path(__file__).parent
parser = argparse.ArgumentParser()
parser.add_argument('--corrected', action='store_true')
args = parser.parse_args()
contract = json.loads((folder / 'correction.json').read_text())
assert version('rdflib') == contract['rdflib']
assert version('owlrl') == contract['owlrl']
functions = {'Graph.items': Graph.items, **{'OWLRL.' + name: getattr(OWLRL_Semantics, name) for name in
             ['_list', '_property_chain', '_properties', '_equality', '_classes', '_class_axioms', '_schema_vocabulary']}}
for name, fn in functions.items():
    assert hashlib.sha256(inspect.getsource(fn).encode()).hexdigest() == contract['functions'][name], name
if args.corrected:
    request = json.load(sys.stdin)
    registered = json.loads((folder / 'inputs.json').read_text())
    encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    assert encode(request) == encode(registered), 'Corrected oracle requires the exact registered collection inputs'
    from rules import install
    install(OWLRL_Semantics)
    sys.stdin = io.StringIO(encode(request))
sys.path.insert(0, str(root / 'tests/parity'))
if args.corrected:
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        runpy.run_path(str(root / 'tests/parity/oracle.py'), run_name='__main__')
    capture = json.loads(output.getvalue())
    capture['collection_correction'] = {**contract, 'excluded_input_limits': [],
        'capture_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'rules_sha256': hashlib.sha256((folder / 'rules.py').read_bytes()).hexdigest()}
    print(json.dumps(capture))
else:
    runpy.run_path(str(root / 'tests/parity/oracle.py'), run_name='__main__')
