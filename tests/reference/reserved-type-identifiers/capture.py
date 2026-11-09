"""Prove reserved-type omission with unchanged standard expansion counterparts."""
import copy
import hashlib
import inspect
import json
from importlib.metadata import version
from pathlib import Path
from pyld import jsonld

source = Path(__file__).with_name('documents.json')
rows = json.loads(source.read_bytes())['cases']
assert len(rows) == len({row['name'] for row in rows}) == 13
assert version('PyLD') == '2.0.4'
assert hashlib.sha256(inspect.getsource(jsonld.JsonLdProcessor._expand).encode()).hexdigest() == '52db03259a5d35d5f73815f6628e452d4191f8dc38a89951414ba5815dd13299'
base = 'file:///crate/ro-crate-metadata.json'

def expand(document):
    jsonld._resolved_context_cache.clear()
    jsonld._inverse_context_cache.clear()
    return jsonld.expand(copy.deepcopy(document), {'base': base})

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

records = []
for row in rows:
    original = expand(row['document'])
    counterpart = expand(row['counterpart'])
    normalized = omit_null_types(original)
    assert normalized == counterpart, row['name']
    original_error = None
    try:
        original_graph = jsonld.to_rdf(copy.deepcopy(row['document']), {'base': base})
    except AttributeError as error:
        original_error = {'type': type(error).__name__, 'message': str(error)}
        assert original_error == {'type': 'AttributeError', 'message': "'NoneType' object has no attribute 'startswith'"}
    assert bool(original_error) == row['omits_null_types'], row['name']
    graph = jsonld.to_rdf(copy.deepcopy(row['counterpart']), {'base': base})
    if not original_error:
        assert original_graph == graph
    triples = []
    for quad in graph.get('@default', []):
        def term(value):
            assert value['type'] != 'blank node', 'These registered graphs contain only named nodes'
            return ['NamedNode', value['value']] if value['type'] == 'IRI' else ['Literal', value['value'], '' if value.get('datatype') == 'http://www.w3.org/2001/XMLSchema#string' else value.get('datatype', ''), value.get('language', '')]
        triples.append([term(quad[key]) for key in ['subject', 'predicate', 'object']])
    triples.sort(key=lambda triple: json.dumps(triple, ensure_ascii=False, separators=(',', ':')))
    records.append({'name': row['name'], 'original_expanded': original,
                    'original_exception': original_error, 'counterpart_expanded': counterpart,
                    'triples': triples})
print(json.dumps({'PyLD': version('PyLD'), 'inputs_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'expand_source_sha256': hashlib.sha256(inspect.getsource(jsonld.JsonLdProcessor._expand).encode()).hexdigest(),
    'cases': records}, ensure_ascii=False, indent=2))
