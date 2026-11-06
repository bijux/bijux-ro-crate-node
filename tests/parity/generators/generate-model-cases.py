"""Generate JSON-safe Pydantic model oracle cases from the pinned upstream checkout."""
import copy
import json
import importlib.metadata
from pathlib import Path
from pydantic import ValidationError
for name, version in {'pydantic': '2.12.5', 'pydantic-core': '2.41.5', 'PyLD': '2.0.4', 'rdflib': '7.6.0'}.items():
    actual = importlib.metadata.version(name)
    if actual != version:
        raise RuntimeError(f'Expected poetry.lock {name}=={version}, found {actual}')

from bia_ro_crate.models import ro_crate_models
from bia_ro_crate.models.model_registry import MODEL_REGISTRY

DESTINATION = Path(__file__).parents[1] / 'expected/model-cases.json'

def valid_value(schema):
    if '$ref' in schema:
        return {'@id': '#reference'}
    if 'anyOf' in schema:
        return valid_value(next(s for s in schema['anyOf'] if s.get('type') != 'null'))
    if schema.get('format') == 'date':
        return '2024-02-29'
    if schema.get('format') == 'uri':
        return 'https://example.org/'
    if schema['type'] == 'array':
        return [valid_value(schema['items'])] * schema.get('minItems', 0)
    if schema['type'] == 'object':
        return {}
    if schema['type'] == 'integer':
        return 2024
    return 'value'

cases = []
def record(name, uri, model, entity):
    try:
        result = model.model_validate(entity)
        expected = {'entity': result.model_dump(mode='json', by_alias=True), 'errors': []}
    except ValidationError as error:
        expected = {'errors': [{key: e[key] for key in ('loc', 'msg', 'type')} for e in error.errors()]}
    cases.append({'name': name, 'uri': str(uri), 'input': entity, 'expected': expected})

for uri, model in MODEL_REGISTRY.items():
    schema = model.model_json_schema()
    base = {key: valid_value(schema['properties'][key]) for key in schema.get('required', [])}
    base['@id'] = './' if model.__name__ == 'Study' else '#object'
    base['@type'] = str(uri)
    record(f'{model.__name__} valid minimal', uri, model, base)
    populated = base | {key: valid_value(field) for key, field in schema['properties'].items()}
    populated['@id'] = base['@id']
    populated['@type'] = base['@type']
    record(f'{model.__name__} all fields', uri, model, populated)
    record(f'{model.__name__} extra fields', uri, model, base | {'unrecognized': {'nested': 42}})
    for key, field in schema['properties'].items():
        missing = copy.deepcopy(base)
        missing.pop(key, None)
        record(f'{model.__name__}.{key} missing', uri, model, missing)
        for value in [None, 42, True, {}, [], ['value']]:
            record(f'{model.__name__}.{key} = {value!r}', uri, model, base | {key: value})
        if '$ref' in field or field.get('items', {}).get('$ref'):
            for value in [{'id': '#reference'}, {'@id': 42}, {'@id': 'bad id'}, {'@id': '_:blank', 'extra': True}]:
                supplied = [value] if field.get('type') == 'array' else value
                record(f'{model.__name__}.{key} reference {value!r}', uri, model, base | {key: supplied})
        if key in ('@id', '@type'):
            alternate = copy.deepcopy(base)
            alternate.pop(key, None)
            alternate[key[1:]] = base[key]
            record(f'{model.__name__}.{key} field name', uri, model, alternate)
    if model.__name__ == 'Study':
        for key in ('datePublished', 'dateModified'):
            for value in ['2023-02-29', 'bad', '2024-02-29T01:00:00Z', 0, 1, 1709164800, 1709164800000, '2024-02-29T00:00:00Z', '2024-02-29T00:00:00+02:00', '2024-02-29T00:00:00+99:99', '2024-02-29_00:00:00', '2024-02-29T00:00:00.0000001', '0000-01-01', '2024-02-29x00:00:00', '2024-02-29T00:00:00+01', '2024-02-29\n', '2024-00-01', '2024-13-01', '2024-01-00', '2024-02-30', '0000-01-01T00:00:00', '2024/02/29', '2024-1-01', '2024-01-1', '2024-02-29T24:00:00', '2024-02-29T00:60:00', '2024-02-29T00:00:60', '2024-02-29T00:00:00+24:00', '2024-02-29T00:00:00.000001', '2024-02-29T00:00:00.', '2024-02-29T00:00Z', '2024-02-29T00:00:00Ztail', '2024-02-29 T00:00:00', 0.0000001, 0.0000009, -0.0000001, -0.0000009, 86400.0000001, 86400.0000009]:
                record(f'Study.{key} date {value!r}', uri, model, base | {key: value})
        for value in ['bad', 'https://', 'http:/foo', 'mailto:test@example.org', '', '  http://example.org  ', 'foo:bar', 'http://[bad]', 'http://a:bad', 'http://a:70000', 'http://a b', 'http://%zz', 'http://127.0.0.999']:
            record(f'Study.license URL {value!r}', uri, model, base | {'license': value})
    if model.__name__ == 'Publication':
        for value in ['1_000', '1__0', '_1', '1_', '1.0', '+2', '2e2', 2.2]:
            record(f'Publication.yearPublished integer {value!r}', uri, model, base | {'yearPublished': value})
DESTINATION.write_text(json.dumps(cases, indent=2) + '\n')
print(f'{len(cases)} model oracle cases written')
