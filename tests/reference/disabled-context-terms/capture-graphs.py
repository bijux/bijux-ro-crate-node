"""Prove disabled-term semantics with two unchanged reference RDF processors."""
import contextlib
import hashlib
import io
import json
import runpy
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / 'scripts/reference'))
with contextlib.redirect_stdout(io.StringIO()):
    environment = runpy.run_path(str(root / 'scripts/reference/verify-environment.py'))
sys.path.insert(0, str(root / 'tests/parity'))
oracle = runpy.run_path(str(root / 'tests/parity/oracle.py'))
from rdflib import Dataset, Graph, Literal
from pyld import jsonld

source = (Path(__file__).parent / 'inputs.json').read_bytes()
cases = json.loads(source)['cases']
contract = json.loads((Path(__file__).parent / 'contract.json').read_text())
base = 'file:///crate/ro-crate-metadata.json'
rows = []
def term(value):
    if isinstance(value, Literal):
        return ['Literal', str(value), str(value.datatype or ''), value.language or '']
    return ['BlankNode' if value.__class__.__name__ == 'BNode' else 'NamedNode', str(value)]
for case in cases:
    document = json.loads(case['files']['ro-crate-metadata.json'])
    token = oracle['case_contexts'].set(case.get('contexts', {}))
    try:
        graph = Graph().parse(data=json.dumps(document), format='json-ld', publicID=base)
        independent = Dataset().parse(data=jsonld.to_rdf(document, {'base': base,
            'format': 'application/n-quads'}), format='nquads')
        assert set(graph) == set(independent.triples((None, None, None))), case['name']
        rows.append({'name': case['name'], 'triples': sorted(
            [[term(value) for value in triple] for triple in graph],
            key=lambda row: json.dumps(row, ensure_ascii=False, separators=(',', ':')))})
    finally:
        oracle['case_contexts'].reset(token)
by_name = {row['name']: row for row in rows}
for name, counterpart in contract['counterparts'].items():
    assert by_name[name]['triples'] == by_name[counterpart]['triples'], name
graphs = {}
receipts = []
for row in rows:
    digest = hashlib.sha256(json.dumps(row['triples'], ensure_ascii=False,
        separators=(',', ':')).encode()).hexdigest()
    graphs[digest] = row['triples']
    receipts.append({'name': row['name'], 'graph_sha256': digest})
print(json.dumps({'reference': environment['reference']['commit'],
    'inputs_sha256': hashlib.sha256(source).hexdigest(), 'graphs': graphs,
    'cases': receipts}, indent=2))
