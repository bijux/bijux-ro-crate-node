"""Bound reserved-type omission to two registered metadata graph requests."""
import contextlib
import copy
from contextvars import ContextVar
import hashlib
import inspect
import json
from importlib.metadata import version
from pathlib import Path
import sys
from pyld import jsonld
from rdflib import Graph, URIRef, BNode, Literal
import bia_ro_crate.core.parser.jsonld_metadata_parser as metadata
from rocrate_validator.models import ValidationContext

folder = Path(__file__).parent
current_case = ContextVar('reserved_type_request')
encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
corrected_names = ('type-index-observer/map/keyword-future', 'type-index-observer/explicit/keyword-future')

def source_identity():
    return {'versions': {name: version(name) for name in ['bia-ro-crate-validator', 'roc-validator', 'PyLD', 'rdflib']},
        'functions': {name: hashlib.sha256(inspect.getsource(value).encode()).hexdigest() for name, value in {
            'metadata_reference_validation': metadata.JSONLDMetadataParser._id_reference_validation,
            'profile_data_graph': ValidationContext.__load_data_graph__, 'Graph.parse': Graph.parse,
            'PyLD.expand': jsonld.JsonLdProcessor._expand, 'PyLD.to_rdf': jsonld.JsonLdProcessor.to_rdf}.items()}}

def registered_request(request):
    source = folder / 'inputs.json'
    contract = json.loads((folder / 'correction.json').read_bytes())
    assert hashlib.sha256(source.read_bytes()).hexdigest() == contract['inputs_sha256']
    registered = json.loads(source.read_bytes())
    assert len(registered['cases']) == len({item['name'] for item in registered['cases']}) == 6
    assert encode(request) == encode(registered), 'Exact registered input order, bytes and contexts required'
    return {item['name']: item for item in registered['cases']}

def omit_null_types(value):
    if isinstance(value, list):
        return [omit_null_types(item) for item in value]
    if not isinstance(value, dict):
        return value
    result = {key: omit_null_types(child) for key, child in value.items()}
    if '@type' in result:
        assert isinstance(result['@type'], list)
        result['@type'] = [item for item in result['@type'] if item is not None]
        if not result['@type']:
            del result['@type']
    return result

def counterpart(case, document):
    assert case['name'] in corrected_names
    assert encode(document) == encode(json.loads(case['files']['ro-crate-metadata.json']))
    result = copy.deepcopy(document)
    if case['name'] == corrected_names[0]:
        node = result['@graph'][-1]
        assert list(node['p']) == ['@future']
        node['p']['@none'] = node['p'].pop('@future')
    else:
        assert result['@graph'][-1]['@type'] == '@future'
        del result['@graph'][-1]['@type']
    return result

def equivalent_graph(case, document, base):
    changed = counterpart(case, document)
    options = {'base': base}
    original_expanded = jsonld.expand(copy.deepcopy(document), options)
    changed_expanded = jsonld.expand(copy.deepcopy(changed), options)
    assert omit_null_types(original_expanded) == changed_expanded
    graph = Graph().parse(data=copy.deepcopy(changed), format='json-ld', publicID=base)
    pyld_graph = jsonld.to_rdf(copy.deepcopy(changed), options)
    assert set(pyld_graph) <= {'@default'}, 'These registered counterparts have no named graphs'
    def pyld_term(value):
        if value['type'] == 'IRI':
            return ['NamedNode', value['value']]
        assert value['type'] == 'literal', 'Registered graphs contain no anonymous nodes'
        return ['Literal', value['value'], value.get('datatype', ''), value.get('language', '').lower()]
    standard = [[pyld_term(quad[key]) for key in ['subject', 'predicate', 'object']]
                for quad in pyld_graph.get('@default', [])]
    def rdf_term(value):
        assert not isinstance(value, BNode)
        if isinstance(value, Literal):
            # RDF 1.1 simple strings denote xsd:string; retain the actual RDFLib
            # constructors in the returned graph, projecting only this proof.
            datatype = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString' if value.language else str(value.datatype or 'http://www.w3.org/2001/XMLSchema#string')
            return ['Literal', str(value), datatype, (value.language or '').lower()]
        return ['NamedNode', str(value)]
    actual = [[rdf_term(value) for value in quad] for quad in graph]
    assert sorted(map(encode, actual)) == sorted(map(encode, standard)), 'Counterpart processors differ'
    return graph, hashlib.sha256(encode(changed).encode()).hexdigest()

@contextlib.contextmanager
def reserved_type_graphs(oracle, request):
    registered = registered_request(request)
    contract = json.loads((folder / 'correction.json').read_bytes())
    assert source_identity() == contract['reference'], 'Pinned parser or loader source changed'
    original_graph = metadata.Graph
    original_method = metadata.JSONLDMetadataParser._id_reference_validation
    original_profile = ValidationContext.__load_data_graph__
    original_case = oracle['run_case']
    namespace = original_case.__globals__
    assert original_graph is Graph
    observations = []
    def selected_case():
        case = current_case.get()
        assert encode(case) == encode(registered[case['name']]), 'Unregistered correction request'
        return case
    class MetadataGraph(Graph):
        def parse(self, source=None, *args, **kwargs):
            assert sys._getframe(1).f_code is original_method.__code__, 'Wrong metadata graph role'
            assert not args and kwargs == {'format': 'json-ld'}
            case = selected_case()
            path = Path(source)
            assert path.name == 'ro-crate-metadata.json'
            assert path.read_bytes() == case['files'][path.name].encode('utf-8'), 'Metadata bytes changed'
            if case['name'] not in corrected_names:
                return super().parse(source, *args, **kwargs)
            graph, digest = equivalent_graph(case, json.loads(path.read_bytes()), path.resolve().as_uri())
            for quad in graph:
                self.add(quad)
            observations.append({'name': case['name'], 'role': 'metadata reference graph',
                'triples': len(self), 'counterpart_sha256': digest})
            return self
    def profile_graph(self):
        case = selected_case()
        if case['name'] not in corrected_names:
            return original_profile(self)
        graph, digest = equivalent_graph(case, self.ro_crate.metadata.as_dict(), self.publicID)
        observations.append({'name': case['name'], 'role': 'profile data graph',
            'triples': len(graph), 'counterpart_sha256': digest})
        return graph
    def run_case(case):
        assert encode(case) == encode(registered[case['name']]), 'Unregistered crate request'
        token = current_case.set(copy.deepcopy(case))
        try:
            return original_case(case)
        finally:
            current_case.reset(token)
    try:
        metadata.Graph = MetadataGraph
        ValidationContext.__load_data_graph__ = profile_graph
        namespace['run_case'] = run_case
        yield {**contract, 'observations': observations}
        assert [(row['name'], row['role']) for row in observations] == [
            (name, role) for name in corrected_names for role in ['metadata reference graph', 'profile data graph']]
        for case in request['cases']:
            assert encode(case) == encode(registered[case['name']])
    finally:
        metadata.Graph = original_graph
        ValidationContext.__load_data_graph__ = original_profile
        namespace['run_case'] = original_case
