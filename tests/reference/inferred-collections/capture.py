"""Capture unchanged Python or the isolated, bounded collection-rule correction."""
import argparse
import contextlib
import hashlib
import inspect
import io
import json
import runpy
import sys
import textwrap
from importlib.metadata import version
from pathlib import Path

from rdflib import Graph, RDF
from owlrl import OWLRL_Semantics

root = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('--corrected', action='store_true')
args = parser.parse_args()
contract = json.loads(Path(__file__).with_name('correction.json').read_text())
assert version('rdflib') == contract['rdflib']
assert version('owlrl') == contract['owlrl']
functions = {'Graph.items': Graph.items, 'OWLRL._list': OWLRL_Semantics._list,
             'OWLRL._property_chain': OWLRL_Semantics._property_chain,
             '_properties': OWLRL_Semantics._properties, '_equality': OWLRL_Semantics._equality}
for name, fn in functions.items():
    assert hashlib.sha256(inspect.getsource(fn).encode()).hexdigest() == contract['functions'][name], name

if args.corrected:
    request = json.load(sys.stdin)
    registered = json.loads(Path(__file__).with_name('inputs.json').read_text())
    encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    assert encode(request) == encode(registered), 'Corrected oracle requires the exact registered collection inputs'
    # This oracle is limited to the declared nonbranching fixtures. Its input
    # limits remain captured against untouched Python rather than emulated here.
    def complete_list(self, head):
        values, seen = [], set()
        while head is not None and head != RDF.nil:
            if head in seen:
                return []
            seen.add(head)
            first = self.graph.value(head, RDF.first)
            rest = self.graph.value(head, RDF.rest)
            if first is None or rest is None:
                return []
            values.append(first)
            head = rest
        return values if head == RDF.nil else []

    OWLRL_Semantics._list = complete_list
    module = sys.modules[OWLRL_Semantics.__module__]
    for name, replacements in {
        '_equality': [
            ('range(i + 1, len(zis) - 1)', 'range(i + 1, len(zis))'),
            (') and zi != zj:', '):'),
        ],
        '_properties': [('range(i + 1, len(pis) - 1)', 'range(i + 1, len(pis))')],
    }.items():
        source = inspect.getsource(getattr(OWLRL_Semantics, name))
        for before, after in replacements:
            assert source.count(before) == 1, (name, before)
            source = source.replace(before, after)
        namespace = dict(module.__dict__)
        exec(textwrap.dedent(source), namespace)
        setattr(OWLRL_Semantics, name, namespace[name])
    limits = json.loads(Path(__file__).with_name('limits.json').read_text())
    excluded = [case['name'] for case in request['cases'] if case['name'] in limits]
    assert set(excluded) == set(limits), 'Capture the complete declared family'
    request['cases'] = [case for case in request['cases'] if case['name'] not in limits]
    sys.stdin = io.StringIO(json.dumps(request))
sys.path.insert(0, str(root / 'tests/parity'))
if args.corrected:
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        runpy.run_path(str(root / 'tests/parity/oracle.py'), run_name='__main__')
    capture = json.loads(output.getvalue())
    capture['collection_correction'] = {**contract, 'excluded_input_limits': excluded,
        'capture_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    print(json.dumps(capture))
else:
    runpy.run_path(str(root / 'tests/parity/oracle.py'), run_name='__main__')
