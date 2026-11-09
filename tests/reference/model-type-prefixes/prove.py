"""Verify the exact flat full-URI counterparts with unchanged JSON-LD processors."""
import copy
import hashlib
import json
from importlib.metadata import version
from pathlib import Path
import runpy
import sys
from pyld import jsonld
from rdflib import Graph
from rdflib.compare import isomorphic
from bia_ro_crate.core.parser.jsonld_metadata_parser import JSONLDMetadataParser
from pydantic import ValidationError
assert version('PyLD') == '2.0.4' and version('rdflib') == '7.6.0'
folder = Path(__file__).parent
root = folder.parents[2]
sys.path.insert(0, str(root / 'tests/parity'))
runpy.run_path(str(root / 'tests/parity/oracle.py'))
source = folder / 'inputs.json'
source_pairs = folder / 'counterparts.json'
request = json.loads(source.read_bytes())
registered = {item['name']: item for item in request['cases']}
assert len(registered) == len(request['cases']) == 20
pairs = json.loads(source_pairs.read_bytes())['pairs']
assert len(pairs) == 5

def flat(document):
    def reference(value):
        if isinstance(value, list):
            return all(reference(item) for item in value)
        if not isinstance(value, dict):
            return True
        return list(value) == ['@id'] and isinstance(value['@id'], str)
    return all(isinstance(entity.get('@id'), str) and all(reference(value) for key,value in entity.items() if key not in ['@id', '@type']) for entity in document['@graph'])

records = []
for pair in pairs:
    before, after = (registered[pair[key]] for key in ['original', 'counterpart'])
    assert before.get('contexts', {}) == after.get('contexts', {}) == {}
    old_text, new_text = (case['files']['ro-crate-metadata.json'] for case in [before, after])
    document, counterpart = map(json.loads, [old_text, new_text])
    assert flat(document) and flat(counterpart)
    aliases = [value for node in document['@graph'] for value in node.get('@type', []) if isinstance(value, str) and value.startswith('lab:/')]
    assert len(aliases) == 1
    alias = aliases[0]
    assert old_text.count(alias) == 1
    assert new_text == old_text.replace(alias, 'http://bia/' + alias.removeprefix('lab:/'))
    assert {key:value for key,value in before['files'].items() if key != 'ro-crate-metadata.json'} == {key:value for key,value in after['files'].items() if key != 'ro-crate-metadata.json'}
    assert document['@context'] == counterpart['@context']
    parser = JSONLDMetadataParser(root / 'artifacts/work')
    projection = parser._parse_context(copy.deepcopy(document['@context'])).to_dict()
    target = next(node for node in document['@graph'] if alias in node.get('@type', []))
    old_types = JSONLDMetadataParser._expand_entity(copy.deepcopy(target), projection).get('@type', [])
    full_types = JSONLDMetadataParser._expand_entity(copy.deepcopy(target), copy.deepcopy(document['@context'])).get('@type', [])
    old_models = sorted(str(uri) for uri in parser._get_class_intersection(set(map(__import__('rdflib').URIRef, old_types))))
    full_models = sorted(str(uri) for uri in parser._get_class_intersection(set(map(__import__('rdflib').URIRef, full_types))))
    assert len(old_models) == 1 and len(full_models) == 2
    options = {'base': 'file:///crate/ro-crate-metadata.json'}
    expanded = jsonld.expand(copy.deepcopy(document), options)
    expanded_counterpart = jsonld.expand(copy.deepcopy(counterpart), options)
    assert expanded == expanded_counterpart
    graph = Graph().parse(data=copy.deepcopy(document), format='json-ld', publicID=options['base'])
    graph_counterpart = Graph().parse(data=copy.deepcopy(counterpart), format='json-ld', publicID=options['base'])
    assert isomorphic(graph, graph_counterpart)
    canonical = {'algorithm': 'URDNA2015', 'format': 'application/n-quads', **options}
    normalized = jsonld.normalize(copy.deepcopy(document), canonical)
    assert normalized == jsonld.normalize(copy.deepcopy(counterpart), canonical)
    records.append({**pair, 'flat': True, 'replaced_type': alias,
        'original_metadata_sha256': hashlib.sha256(old_text.encode()).hexdigest(),
        'counterpart_metadata_sha256': hashlib.sha256(new_text.encode()).hexdigest(),
        'expanded_sha256': hashlib.sha256(json.dumps(expanded, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest(),
        'canonical_graph_sha256': hashlib.sha256(normalized.encode()).hexdigest(),
        'triples': len(graph), 'projected_models': old_models, 'full_context_models': full_models})
single = registered['model-type-prefixes/single-model-alias']
single_doc = json.loads(single['files']['ro-crate-metadata.json'])
single_entity = single_doc['@graph'][1]
parser = JSONLDMetadataParser(root / 'artifacts/work')
model = parser.parser_classes_map[__import__('rdflib').URIRef('http://bia/Study')]
try:
    model(**copy.deepcopy(single_entity))
except ValidationError as error:
    single_error = {'model': 'http://bia/Study',
        'entity_sha256': hashlib.sha256(json.dumps(single_entity, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest(),
        'errors': [{key: item[key] for key in ['loc', 'type', 'msg']} for item in error.errors()],
        'rendered_messages': [JSONLDMetadataParser._format_pydantic_error(item) for item in error.errors()]}
else:
    raise AssertionError('The existing raw type-token validator must keep rejecting the alias')
print(json.dumps({'proof_source_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'single_model_alias': single_error, 'versions': {name: version(name) for name in ['PyLD', 'rdflib']},
    'inputs_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'counterparts_sha256': hashlib.sha256(source_pairs.read_bytes()).hexdigest(), 'pairs': records}, indent=2))
