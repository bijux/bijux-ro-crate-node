"""Bound the metadata reference graph to standard JSON-LD default-graph output."""
import contextlib
import copy
import hashlib
import inspect
import json
import sys
from contextvars import ContextVar
from pathlib import Path
from importlib.metadata import version
from pyld import jsonld
from rdflib import Graph, URIRef, BNode, Literal
from rdflib.term import _is_valid_langtag
from language import well_formed
import bia_ro_crate.core.parser.jsonld_metadata_parser as metadata

folder = Path(__file__).parent
current_case = ContextVar('jsonld_reference_case')
encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)

def source_identity():
    return {'versions': {name: version(name) for name in ['bia-ro-crate-validator', 'PyLD', 'rdflib']},
            'functions': {name: hashlib.sha256(inspect.getsource(value).encode()).hexdigest() for name, value in {
                'metadata_reference_validation': metadata.JSONLDMetadataParser._id_reference_validation,
                'Graph.parse': Graph.parse, 'PyLD.to_rdf': jsonld.JsonLdProcessor.to_rdf,
                'PyLD.expand': jsonld.JsonLdProcessor._expand,
                'PyLD.index_map': jsonld.JsonLdProcessor._expand_index_map,
                'PyLD.object_to_rdf': jsonld.JsonLdProcessor._object_to_rdf,
                'RDFLib.language_tag': _is_valid_langtag}.items()}}

def validate_expanded_values(value):
    if isinstance(value, list):
        for item in value:
            validate_expanded_values(item)
    elif isinstance(value, dict):
        if '@value' in value and isinstance(value.get('@type'), list):
            raise jsonld.JsonLdError(
                'Invalid JSON-LD syntax; value object @type must be a single absolute IRI.',
                'jsonld.SyntaxError', {'element': value}, code='invalid typed value')
        for item in value.values():
            validate_expanded_values(item)

@contextlib.contextmanager
def standard_metadata_graph(oracle):
    contract = json.loads((folder / 'correction.json').read_text())
    assert source_identity() == contract['reference'], 'Pinned parser or dependency source changed'
    assert hashlib.sha256((folder / 'language.py').read_bytes()).hexdigest() == contract['language_grammar_sha256']
    input_bytes = (folder / 'inputs.json').read_bytes()
    assert hashlib.sha256(input_bytes).hexdigest() == json.loads((folder / 'contract.json').read_text())['inputs_sha256']
    request = json.loads(input_bytes)
    registered = {item['name']: item for item in request['cases'] if not item['name'].startswith('jsonld-context/remote-local/')}
    assert len(registered) == 72
    observations = []
    contract = {**contract, 'observations': observations}
    original_graph = metadata.Graph
    original_case = oracle['run_case']
    namespace = original_case.__globals__
    original_method = metadata.JSONLDMetadataParser._id_reference_validation
    assert original_graph is Graph

    class MetadataGraph(Graph):
        def parse(self, source=None, *args, **kwargs):
            assert sys._getframe(1).f_code is original_method.__code__, 'Wrong graph parsing role'
            assert not args and kwargs == {'format': 'json-ld'}, 'Unexpected metadata parse options'
            case = current_case.get()
            assert encode(case) == encode(registered[case['name']]), 'Unregistered graph correction request'
            path = Path(source)
            assert path.name == 'ro-crate-metadata.json'
            assert path.read_bytes() == case['files'][path.name].encode('utf-8'), 'Metadata bytes changed'
            document = json.loads(case['files'][path.name])
            options = {'base': path.resolve().as_uri()}
            # Index insertion must not leave an array-valued literal datatype.
            # Re-expansion would repair this state, so validate it before RDF conversion.
            event = {'name': case['name'], 'role': 'metadata reference graph', 'stage': 'expansion'}
            observations.append(event)
            try:
                expanded = jsonld.expand(copy.deepcopy(document), options)
                event['stage'] = 'expanded value validation'
                validate_expanded_values(expanded)
                event['stage'] = 'RDF conversion'
                dataset = jsonld.to_rdf(document, options)
            except jsonld.JsonLdError as error:
                event['error'] = {'type': error.type, 'code': error.code, 'message': str(error.args[0])}
                raise

            def term(value):
                kind, text = value['type'], value['value']
                if kind == 'IRI':
                    return URIRef(text)
                if kind == 'blank node':
                    return BNode(text.removeprefix('_:'))
                if value.get('language'):
                    return Literal(text, lang=value['language'], normalize=False)
                return Literal(text, datatype=URIRef(value['datatype']), normalize=False)

            for quad in dataset.get('@default', []):
                language = quad['object'].get('language')
                # JSON-LD Object-to-RDF 8.2.2.7 discards malformed language literals.
                if language is not None and not well_formed(language):
                    continue
                self.add(tuple(term(quad[key]) for key in ['subject', 'predicate', 'object']))
            event.update(stage='default graph populated', triples=len(self),
                         named_graphs=sum(key != '@default' for key in dataset))
            return self

    def run_case(case):
        assert encode(case) == encode(registered[case['name']]), 'Unregistered corrected crate'
        token = current_case.set(copy.deepcopy(case))
        try:
            return original_case(case)
        finally:
            current_case.reset(token)

    try:
        metadata.Graph = MetadataGraph
        namespace['run_case'] = run_case
        yield contract
        assert [row['name'] for row in observations] == list(registered), 'Metadata graph roles were not all executed'
    finally:
        metadata.Graph = original_graph
        namespace['run_case'] = original_case
