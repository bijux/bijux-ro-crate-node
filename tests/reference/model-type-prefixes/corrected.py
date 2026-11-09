"""Retain explicit prefix roles for exact model identity requests."""
import contextlib
import copy
from contextvars import ContextVar
import hashlib
import inspect
import json
from importlib.metadata import version
from pathlib import Path
import sys
from types import MethodType
from pyld import jsonld
from bia_ro_crate.core.parser.jsonld_metadata_parser import JSONLDMetadataParser
from bia_ro_crate.models.linked_data.ld_context.SimpleJSONLDContext import SimpleJSONLDContext

folder = Path(__file__).parent
current_case = ContextVar('model_type_prefix_case')
encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)

def source_identity():
    return {'versions': {name: version(name) for name in ['bia-ro-crate-validator', 'PyLD']},
        'functions': {name: hashlib.sha256(inspect.getsource(value).encode()).hexdigest() for name,value in {
            'parse_context': JSONLDMetadataParser._parse_context,
            'expand_entity': JSONLDMetadataParser._expand_entity,
            'context_to_dict': SimpleJSONLDContext.to_dict,
            'parse_objects': JSONLDMetadataParser._parse_objects,
            'PyLD.process_context': jsonld.JsonLdProcessor.process_context}.items()}}

def registered_request(request):
    source = folder / 'inputs.json'
    contract = json.loads((folder / 'correction.json').read_bytes())
    assert hashlib.sha256(source.read_bytes()).hexdigest() == contract['inputs_sha256']
    for name,key in [('counterparts.json', 'counterparts_sha256'), ('proof.json', 'proof_sha256'), ('prove.py', 'proof_source_sha256')]:
        assert hashlib.sha256((folder / name).read_bytes()).hexdigest() == contract[key]
    expected = json.loads(source.read_bytes())
    assert len(expected['cases']) == len({item['name'] for item in expected['cases']}) == 20
    assert encode(request) == encode(expected), 'Exact registered order, files and contexts required'
    return {item['name']: item for item in expected['cases']}

@contextlib.contextmanager
def model_type_prefixes(oracle, request):
    registered = registered_request(request)
    contract = json.loads((folder / 'correction.json').read_bytes())
    assert source_identity() == contract['reference'], 'Pinned model-context source changed'
    original_parse = JSONLDMetadataParser._parse_context
    original_expand = JSONLDMetadataParser._expand_entity
    original_dict = SimpleJSONLDContext.to_dict
    original_case = oracle['run_case']
    namespace = original_case.__globals__
    observations = []
    def parse_context(self, context):
        assert sys._getframe(1).f_code is JSONLDMetadataParser.parse.__code__, 'Wrong model-context parsing role'
        case = current_case.get()
        assert encode(case) == encode(registered[case['name']]), 'Unregistered model-context request'
        path = self._ro_crate_root / 'ro-crate-metadata.json'
        assert path.read_bytes() == case['files'][path.name].encode('utf-8'), 'Metadata bytes changed'
        document = json.loads(path.read_bytes())
        assert encode(context) == encode(document['@context'])
        event = {'name': case['name'], 'role': 'model identity context', 'parsed': False, 'serializations': 0, 'identities': []}
        observations.append(event)
        # Preserve all original validation and the returned terms/prefixes.
        parsed = original_parse(self, context)
        assert encode(context) == encode(document['@context'])
        mappings = jsonld.JsonLdProcessor().process_context(
            active_ctx={'mappings': {}}, local_ctx=copy.deepcopy(context), options=None)['mappings']
        original_serialization = parsed.to_dict
        projected_before = original_serialization()
        expected_entities = copy.deepcopy(document['@graph'])
        def to_dict(owner):
            assert owner is parsed
            frame = sys._getframe(1)
            assert frame.f_code is JSONLDMetadataParser._parse_objects.__code__, 'Wrong identity serialization role'
            index = event['serializations']
            assert index < len(expected_entities)
            entity = frame.f_locals['entity']
            assert encode(entity) == encode(expected_entities[index]), 'Entity order or bytes changed'
            projected = original_serialization()
            assert encode(projected) == encode(projected_before), 'Original serialization was mutated'
            for key,mapping in mappings.items():
                if key not in projected or not mapping:
                    continue
                if not mapping.get('_prefix', False):
                    continue
                entry = copy.deepcopy(projected[key])
                if not isinstance(entry, dict):
                    entry = {'@id': entry}
                entry['@prefix'] = True
                projected[key] = entry
            event['serializations'] += 1
            if '/unflattened-map/' not in case['name']:
                full = original_expand(copy.deepcopy(entity), copy.deepcopy(context))
                identity = original_expand(copy.deepcopy(entity), copy.deepcopy(projected))
                def keys(node):
                    return {'id': node.get('@id'), 'types': sorted(node.get('@type', []))}
                assert keys(identity) == keys(full), 'Model ID/type changed from the active full context'
                event['identities'].append(keys(identity))
            return projected
        parsed.to_dict = MethodType(to_dict, parsed)
        event['parsed'] = True
        return parsed
    def run_case(case):
        assert encode(case) == encode(registered[case['name']]), 'Unregistered complete input'
        token = current_case.set(copy.deepcopy(case))
        try:
            return original_case(case)
        finally:
            current_case.reset(token)
    try:
        JSONLDMetadataParser._parse_context = parse_context
        namespace['run_case'] = run_case
        yield {**contract, 'observations': observations}
        assert [row['name'] for row in observations] == list(registered), repr([row['name'] for row in observations])
        for row in observations:
            assert row['parsed'] == (row['name'] != 'model-type-prefixes/remapped-field-control')
            if not row['parsed']:
                assert row['serializations'] == 0 and row['identities'] == []
            elif '/unflattened-map/' in row['name']:
                assert row['serializations'] == 2 and row['identities'] == []
            else:
                expected = json.loads(registered[row['name']]['files']['ro-crate-metadata.json'])['@graph']
                assert row['serializations'] == len(row['identities']) == len(expected), 'Incomplete identity proof'
        for case in request['cases']:
            assert encode(case) == encode(registered[case['name']])
    finally:
        JSONLDMetadataParser._parse_context = original_parse
        namespace['run_case'] = original_case
        assert JSONLDMetadataParser._expand_entity is original_expand
        assert SimpleJSONLDContext.to_dict is original_dict
