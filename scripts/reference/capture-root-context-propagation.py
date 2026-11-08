"""Capture root context semantics separately from the failing RDFLib root path."""
import argparse
import contextlib
import copy
import hashlib
import io
import json
from pathlib import Path
import runpy

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root / 'tests/reference/root-context-propagation/graphs.json')
args = parser.parse_args()
with contextlib.redirect_stdout(io.StringIO()):
    environment = runpy.run_path(str(Path(__file__).with_name('verify-environment.py')))
from pyld import jsonld
from rdflib import Graph, Literal, BNode
from rdflib.compare import isomorphic
from rdflib.plugins.shared.jsonld import context as rdf_context

source = (root / 'tests/reference/root-context-propagation/graphs-input.json').read_bytes()
base = 'file:///crate/ro-crate-metadata.json'
def standard(document):
    jsonld._resolved_context_cache.clear()
    jsonld._inverse_context_cache.clear()
    document = copy.deepcopy(document)
    # PyLD 2.0.4 cannot read @propagate from a direct remote root context.
    # Resolve that exact transport document openly for the standards graph proof.
    if isinstance(document.get('@context'), str):
        document['@context'] = load_document(document['@context'])['document']['@context']
    return Graph().parse(data=jsonld.to_rdf(document, {'base': base, 'format': 'application/n-quads'}), format='nt')
def term(value):
    if isinstance(value, Literal):
        return ['Literal', str(value), str(value.datatype or ''), value.language or '']
    return ['BlankNode' if isinstance(value, BNode) else 'NamedNode', str(value)]
standard_context = json.loads((root / 'tests/parity/context.json').read_text())
def loader_for(case):
    def load(url, options=None):
        value = (standard_context if str(url) in {
            'https://w3id.org/ro/crate/1.1/context', 'https://w3id.org/ro/crate/1.1/context.jsonld'
        } else case.get('contexts', {})[str(url)])
        value = copy.deepcopy(value)
        return {'contextUrl': None, 'documentUrl': url,
                'document': json.loads(value) if isinstance(value, str) else value}
    jsonld.set_document_loader(load)
    rdf_context.source_to_json = lambda url, *a, **kw: (load(url)['document'], None)
    return load

def triples(graph):
    result = [[term(s), term(p), term(o)] for s, p, o in graph]
    return sorted(result, key=lambda row: json.dumps(row, ensure_ascii=False, separators=(',', ':')))

rows = []
for case in json.loads(source)['cases']:
    load_document = loader_for(case)
    actual = standard(case['document'])
    counterpart = standard(case['counterpart'])
    equivalent = isomorphic(actual, counterpart)
    standard_triples = triples(actual)
    try:
        Graph().parse(data=json.dumps(case['document']), format='json-ld', publicID=base)
    except Exception as error:
        original = {'type': type(error).__name__, 'message': str(error)}
    else:
        original = None
    if case['mode'] == 'reference-control':
        assert original is None, (case['name'], original)
    else:
        assert original is not None and original['type'] == 'AttributeError' and original['message'] in {
            "'NoneType' object has no attribute 'get_id'",
            "'NoneType' object has no attribute '_subcontext'",
        }, (case['name'], original)
    if case['mode'] in {'reference-counterpart', 'reference-control'}:
        assert equivalent, case['name']
        actual = Graph().parse(data=json.dumps(case['counterpart']), format='json-ld', publicID=base)
    else:
        assert case['mode'] == 'standard' and not equivalent
    rows.append({'name': case['name'], 'original_exception': original,
                 'standard_context_inlined': isinstance(case['document'].get('@context'), str),
                 'standard_equivalent_to_counterpart': equivalent,
                 'standard_triples': standard_triples, 'triples': triples(actual)})
crate_source = (root / 'tests/reference/root-context-propagation/inputs.json').read_bytes()
crate_cases = json.loads(crate_source)['cases']
by_name = {case['name']: case for case in crate_cases}
contract = json.loads((root / 'tests/reference/root-context-propagation/contract.json').read_text())
crate_rows = []
reference_graphs = {}
for case in crate_cases:
    load_document = loader_for(case)
    document = json.loads(case['files']['ro-crate-metadata.json'])
    graph = standard(document)
    counterpart = by_name[contract['counterparts'].get(case['name'], case['name'])]
    load_document = loader_for(counterpart)
    counterpart_document = json.loads(counterpart['files']['ro-crate-metadata.json'])
    assert isomorphic(graph, standard(counterpart_document)), case['name']
    reference_graph = Graph().parse(data=json.dumps(counterpart_document), format='json-ld', publicID=base)
    captured = triples(reference_graph)
    assert reference_graphs.setdefault(counterpart['name'], captured) == captured
    crate_rows.append({'name': case['name'], 'counterpart': counterpart['name'],
                       'standard_graphs_equivalent': True})
args.output.write_text(json.dumps({'reference': environment['commit'], 'python': environment['platform'].python_version(),
    'versions': environment['versions'], 'inputs_sha256': hashlib.sha256(source).hexdigest(), 'cases': rows,
    'crate_inputs_sha256': hashlib.sha256(crate_source).hexdigest(),
    'crate_graphs': crate_rows, 'reference_graphs': reference_graphs}, indent=2) + '\n')
print(f'{len(rows)} root context graph controls captured')
