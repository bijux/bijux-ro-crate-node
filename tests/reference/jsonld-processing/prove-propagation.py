"""Prove the registered remote flag counterparts preserve their RDF meaning."""
import copy
import hashlib
import json
import logging
from pathlib import Path
import runpy
import sys
from pyld import jsonld
from rdflib import Graph, URIRef, BNode, Literal, XSD
from rdflib.compare import isomorphic
from corrected import source_identity

root = Path(__file__).resolve().parents[3]
folder = Path(__file__).parent
sys.path.insert(0, str(root / 'tests/parity'))
oracle = runpy.run_path(str(root / 'tests/parity/oracle.py'))
logging.disable(logging.CRITICAL)
assert source_identity() == json.loads((folder / 'correction.json').read_text())['reference']
original = [item for item in json.loads((folder / 'inputs.json').read_text())['cases']
            if item['name'].startswith('jsonld-context/remote-local/')]
counterparts = json.loads((folder / 'propagation-counterparts.json').read_text())['cases']
assert len(original) == len(counterparts) == len({item['name'] for item in original}) == 8

def pyld_graph(case):
    token = oracle['case_contexts'].set(case['contexts'])
    try:
        jsonld._resolved_context_cache.clear()
        jsonld._inverse_context_cache.clear()
        document = json.loads(case['files']['ro-crate-metadata.json'])
        node = next(item for item in document['@graph']
                    if item.get('@context') == 'https://example.org/local-context')
        # This context has only an absolute alias and the propagation flag.
        # Semantic inlining avoids PyLD's separate raw-URL flag dereference bug.
        node['@context'] = copy.deepcopy(case['contexts']['https://example.org/local-context']['@context'])
        dataset = jsonld.to_rdf(document, {'base': 'file:///crate/ro-crate-metadata.json'})
    finally:
        oracle['case_contexts'].reset(token)
    graph = Graph()

    def term(value):
        if value['type'] == 'IRI':
            return URIRef(value['value'])
        if value['type'] == 'blank node':
            return BNode(value['value'].removeprefix('_:'))
        return Literal(value['value'], lang=value.get('language'),
                       datatype=URIRef(value['datatype']) if 'language' not in value else None,
                       normalize=False)

    for quad in dataset.get('@default', []):
        graph.add(tuple(term(quad[key]) for key in ['subject', 'predicate', 'object']))
    return graph

def standard_terms(graph):
    result = Graph()
    for subject, predicate, value in graph:
        if isinstance(value, Literal) and value.datatype is None and not value.language:
            value = Literal(str(value), datatype=XSD.string, normalize=False)
        result.add((subject, predicate, value))
    return result

rows = []
for item, counterpart in zip(original, counterparts):
    assert item['name'] == counterpart['name'] and item['files'] == counterpart['files']
    allowed = copy.deepcopy(item)
    allowed['contexts']['https://example.org/local-context']['@context'].pop('@propagate')
    assert allowed == counterpart
    document = json.loads(item['files']['ro-crate-metadata.json'])
    local = [node for node in document['@graph']
             if node.get('@context') == 'https://example.org/local-context']
    assert len(local) == 1 and local[0]['extra'] == 'Actual name'
    assert not any(isinstance(value, (dict, list)) for key, value in local[0].items() if key != '@type')
    assert item['contexts']['https://example.org/local-context']['@context'] == {
        '@propagate': item['contexts']['https://example.org/local-context']['@context']['@propagate'],
        'extra': 'http://schema.org/name'}
    before, after = pyld_graph(item), pyld_graph(counterpart)
    assert isomorphic(before, after)
    token = oracle['case_contexts'].set(counterpart['contexts'])
    try:
        reference = Graph().parse(data=counterpart['files']['ro-crate-metadata.json'],
                                 format='json-ld', publicID='file:///crate/ro-crate-metadata.json')
    finally:
        oracle['case_contexts'].reset(token)
    assert isomorphic(standard_terms(reference), after)
    rows.append({'name': item['name'],
        'unchanged_metadata_sha256': hashlib.sha256(item['files']['ro-crate-metadata.json'].encode()).hexdigest(),
        'pyld_original_triples': len(before), 'pyld_counterpart_triples': len(after),
        'rdflib_counterpart_triples': len(reference), 'standard_original_counterpart_isomorphic': True,
        'rdflib_counterpart_standard_isomorphic': True})
print(json.dumps({'reference': source_identity(),
    'inputs_sha256': hashlib.sha256((folder / 'inputs.json').read_bytes()).hexdigest(),
    'counterparts_sha256': hashlib.sha256((folder / 'propagation-counterparts.json').read_bytes()).hexdigest(),
    'literal_projection': 'RDF1.1 untyped string is xsd:string; no report comparator normalization',
    'cases': rows}, indent=2))
