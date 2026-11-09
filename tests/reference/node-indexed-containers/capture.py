"""Capture unchanged independent node-index graph construction."""
import copy
import hashlib
import json
from pathlib import Path
from importlib.metadata import version
from pyld import jsonld
from rdflib import Graph, BNode, Literal

folder = Path(__file__).parent
source = folder / 'documents.json'
cases = json.loads(source.read_text())['cases']
assert len(cases) == len({item['name'] for item in cases}) == 48
assert version('PyLD') == '2.0.4' and version('rdflib') == '7.6.0'
rows = []
for item in cases:
    document = copy.deepcopy(item['document'])
    jsonld._resolved_context_cache.clear()
    jsonld._inverse_context_cache.clear()
    if item['processor'] == 'pyld':
        dataset = jsonld.to_rdf(document, {'base': 'file:///crate/ro-crate-metadata.json'})
        def term(value):
            if value['type'] == 'IRI':
                return ['NamedNode', value['value']]
            if value['type'] == 'blank node':
                return ['BlankNode', value['value'].removeprefix('_:')]
            datatype = value.get('datatype', '')
            if datatype == 'http://www.w3.org/2001/XMLSchema#string':
                datatype = ''
            return ['Literal', value['value'], datatype, value.get('language', '')]
        triples = [[term(quad[key]) for key in ['subject', 'predicate', 'object']]
                   for quad in dataset.get('@default', [])]
    else:
        assert item['processor'] == 'rdflib'
        graph = Graph().parse(data=json.dumps(document), format='json-ld',
                              publicID='file:///crate/ro-crate-metadata.json')
        def term(value):
            if isinstance(value, Literal):
                return ['Literal', str(value), str(value.datatype or ''), value.language or '']
            return ['BlankNode' if isinstance(value, BNode) else 'NamedNode', str(value)]
        triples = [[term(value) for value in triple] for triple in graph]
    assert '_:' not in json.dumps(document), 'The registered documents have no explicit blank-node identifiers'
    anonymous = {value[1] for triple in triples for value in triple if value[0] == 'BlankNode'}
    assert len(anonymous) <= 1, 'Anonymous identity projection is restricted to one graph node'
    for triple in triples:
        for value in triple:
            if value[0] == 'BlankNode':
                value[1] = 'anonymous'
    triples.sort(key=lambda triple: json.dumps(triple, ensure_ascii=False, separators=(',', ':')))
    rows.append({'name': item['name'], 'processor': item['processor'],
                 'anonymous_nodes': len(anonymous), 'triples': triples})
print(json.dumps({'versions': {'PyLD': version('PyLD'), 'rdflib': version('rdflib')},
    'inputs_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'cases': rows}, ensure_ascii=False, indent=2))
