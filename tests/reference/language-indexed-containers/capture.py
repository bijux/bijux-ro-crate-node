"""Capture language-map literal semantics with unchanged independent processors."""
import copy
import hashlib
import json
from importlib.metadata import version
from pathlib import Path
from pyld import jsonld
from rdflib import Graph, Literal, BNode

source = Path(__file__).with_name('documents.json')
cases = json.loads(source.read_bytes())['cases']
assert len(cases) == len({item['name'] for item in cases}) == 16
assert version('PyLD') == '2.0.4' and version('rdflib') == '7.6.0'
rows = []
for item in cases:
    jsonld._resolved_context_cache.clear()
    jsonld._inverse_context_cache.clear()
    try:
        jsonld.expand(copy.deepcopy(item['document']), {'base': 'file:///crate/ro-crate-metadata.json'})
    except jsonld.JsonLdError as error:
        assert item.get('error'), item['name']
        rows.append({'name': item['name'], 'error_type': error.type, 'error_code': error.code})
        continue
    assert not item.get('error'), item['name']
    dataset = jsonld.to_rdf(copy.deepcopy(item['document']), {'base': 'file:///crate/ro-crate-metadata.json'})
    def term(value):
        assert value['type'] != 'blank node'
        return ['NamedNode', value['value']] if value['type'] == 'IRI' else ['Literal', value['value'],
            '' if value.get('datatype') == 'http://www.w3.org/2001/XMLSchema#string' else value.get('datatype', ''), value.get('language', '')]
    triples = [[term(quad[key]) for key in ['subject', 'predicate', 'object']]
               for quad in dataset.get('@default', [])]
    triples.sort(key=lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':')))
    graph = Graph().parse(data=json.dumps(item['document']), format='json-ld', publicID='file:///crate/ro-crate-metadata.json')
    def rdf_term(value):
        assert not isinstance(value, BNode)
        return ['Literal', str(value), 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString' if value.language else str(value.datatype or ''), value.language or ''] if isinstance(value, Literal) else ['NamedNode', str(value)]
    rdf_triples = [[rdf_term(value) for value in triple] for triple in graph]
    rdf_triples.sort(key=lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':')))
    assert rdf_triples == triples, item['name']
    rows.append({'name': item['name'], 'triples': triples})
print(json.dumps({'versions': {'PyLD': version('PyLD'), 'rdflib': version('rdflib')},
    'inputs_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'cases': rows}, ensure_ascii=False, indent=2))
