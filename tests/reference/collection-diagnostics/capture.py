"""Capture exact recursive-diagnostic cases without changing installed Python."""
import argparse
import contextlib
import hashlib
import inspect
import io
import json
import runpy
import sys
from pathlib import Path
from importlib.metadata import version
import pyshacl.rdfutil.stringify as formatter
import pyshacl.rdfutil.clone as cloner
from rdflib import BNode, RDF
from rdflib import Graph

root = Path(__file__).resolve().parents[3]
folder = Path(__file__).parent
parser = argparse.ArgumentParser()
parser.add_argument('--corrected', action='store_true')
args = parser.parse_args()
contract = json.loads((folder / 'correction.json').read_text())
source = inspect.getsource(formatter.stringify_blank_node)
assert version('pyshacl') == contract['pyshacl']
assert version('rdflib') == contract['rdflib']
assert hashlib.sha256(source.encode()).hexdigest() == contract['functions']['stringify_blank_node']
assert hashlib.sha256(inspect.getsource(Graph.items).encode()).hexdigest() == contract['functions']['Graph.items']
assert hashlib.sha256(inspect.getsource(cloner.clone_list).encode()).hexdigest() == contract['functions']['clone_list']
request = json.load(sys.stdin)
registered = json.loads((folder / 'inputs.json').read_text())
encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
assert encode(request) == encode(registered), 'Diagnostic correction requires exact registered inputs and order'
if args.corrected:
    before = '''        for item in iter(graph.items(node)):
            item_text = stringify_node(graph, item, ns_manager=ns_manager, recursion=recursion + 1)
            item_texts.append(item_text)'''
    after = '''        try:
            for item in iter(graph.items(node)):
                item_text = stringify_node(graph, item, ns_manager=ns_manager, recursion=recursion + 1)
                item_texts.append(item_text)
        except ValueError as error:
            if str(error) != "List contains a recursive rdf:rest reference":
                raise
            item_texts.append("<http://recursion.too.deep>")'''
    assert source.count(before) == 1, 'Exact diagnostic correction no longer applies'
    exec(source.replace(before, after), formatter.__dict__)
    original_clone_list = cloner.clone_list

    def cycle_preserving_clone(graph, lnode, target_graph, keepid=False, recursion=0, deep_clone=False):
        try:
            list(graph.items(lnode))
        except ValueError as error:
            if str(error) != "List contains a recursive rdf:rest reference":
                raise
        else:
            return original_clone_list(graph, lnode, target_graph, keepid, recursion, deep_clone)
        cells, current, seen = {}, lnode, set()

        def clone_cell(cell):
            if cell not in cells:
                assert isinstance(cell, BNode), 'Registered cyclic cells must be blank nodes'
                cells[cell] = BNode(str(cell)) if keepid else BNode()
            return cells[cell]

        while current not in seen:
            seen.add(current)
            members, tails = list(graph.objects(current, RDF.first)), list(graph.objects(current, RDF.rest))
            assert len(members) == len(tails) == 1, 'Registered cyclic cells must have one first/rest arc'
            copied = clone_cell(current)
            item = cloner.clone_node(graph, members[0], target_graph,
                                     recursion=recursion + 1, deep_clone=deep_clone)
            target_graph.add((copied, RDF.first, item))
            target_graph.add((copied, RDF.rest, clone_cell(tails[0])))
            current = tails[0]
        return clone_cell(lnode)

    cloner.clone_list = cycle_preserving_clone
sys.stdin = io.StringIO(encode(request))
sys.path.insert(0, str(root / 'tests/parity'))
output = io.StringIO()
with contextlib.redirect_stdout(output):
    runpy.run_path(str(root / 'tests/parity/oracle.py'), run_name='__main__')
capture = json.loads(output.getvalue())
if args.corrected:
    capture['collection_diagnostic_correction'] = {
        **contract, 'capture_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    }
print(json.dumps(capture))
