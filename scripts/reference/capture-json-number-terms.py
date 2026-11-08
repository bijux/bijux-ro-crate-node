"""Capture native JSON numeric kinds and RDF terms from the locked parser."""
import argparse
from importlib.metadata import version
import json
import logging
from pathlib import Path
import platform
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root / 'tests/parity/expected/json-number-terms.json')
args = parser.parse_args()
subprocess.run([sys.executable, str(root / 'scripts/reference/verify-environment.py')],
               check=True, stdout=subprocess.DEVNULL)
from rdflib import Graph
from rdflib.plugins.shared.jsonld.util import _HAS_ORJSON
assert not _HAS_ORJSON, 'Locked reference requires the standard JSON reader'
logging.disable(logging.CRITICAL)
reference = json.loads((root / 'docs/compatibility/reference.json').read_text())
inputs = []
tokens = ['1', '1.0', '1e0', '-0', '-0.0', '0.0', '1.25', '1e-7', '1e16',
          '9007199254740993', '9007199254740993.0', '1e309', 'NaN', '-Infinity']
types = ['double', 'float', 'decimal', 'integer', 'string', 'urn:custom']
for token in tokens:
    inputs.append((f'number/default/{token}', '{"@id":"urn:subject","urn:value":' + token + '}'))
    for kind in types:
        datatype = kind if kind.startswith('urn:') else 'http://www.w3.org/2001/XMLSchema#' + kind
        for mode in ['explicit', 'coerced', 'aliases']:
            context = {'value': {'@id': 'urn:value'}, 'val': '@value', 'dtype': '@type'}
            if mode == 'coerced':
                context['value']['@type'] = datatype
                fragment = token
            else:
                value_key, type_key = ('val', 'dtype') if mode == 'aliases' else ('@value', '@type')
                fragment = '{' + json.dumps(value_key) + ':' + token + ',' + json.dumps(type_key) + ':' + json.dumps(datatype) + '}'
            source = '{"@context":' + json.dumps(context) + ',"@id":"urn:subject","value":' + fragment + '}'
            inputs.append((f'number/{mode}/{kind}/{token}', source))
json_values = ['1', '1.0', '-0', '-0.0', '1e-7', '1e16', '9007199254740993', 'NaN', 'Infinity',
               '[1,1.0,-0,-0.0,1e-7]', '{"z":1.0,"a":1}',
               '{"\\ud800\\udc00":1.0,"\\uffff":2,"__proto__":-0.0}',
               '"\\ud800"', '"\\\\ud800"', '"\\u0000\\t\\n\\r"', 'null', 'true']
for fragment in json_values:
    for mode in ['explicit', 'coerced', 'aliases']:
        context = {'value': {'@id': 'urn:value'}, 'val': '@value', 'dtype': '@type'}
        if mode == 'coerced':
            context['value']['@type'] = '@json'
            value = fragment
        else:
            value_key, type_key = ('val', 'dtype') if mode == 'aliases' else ('@value', '@type')
            value = '{' + json.dumps(value_key) + ':' + fragment + ',' + json.dumps(type_key) + ':"@json"}'
        source = '{"@context":' + json.dumps(context) + ',"@id":"urn:subject","value":' + value + '}'
        inputs.append((f'json/{mode}/{fragment}', source))
inputs += [
    ('number/array-native-kinds', '{"@id":"urn:subject","urn:value":[1,1.0,-0,-0.0]}'),
    ('number/default-language', '{"@context":{"@language":"en"},"@id":"urn:subject","urn:value":[1,1.0]}'),
    ('number/duplicate-native-and-lexical-terms', '{"@id":"urn:subject","urn:value":[1,1.0,1,1e0,{"@value":"01","@type":"http://www.w3.org/2001/XMLSchema#integer"}]}'),
    ('number/empty-and-absent-datatypes', '{"@context":{"value":{"@id":"urn:value","@type":"@vocab"}},"@id":"urn:subject","value":[1.0,{"@value":"1.0"}]}'),
]
for coercion in ['@id', '@vocab', '@none']:
    for token in ['1', '1.0', '-0.0']:
        context = {'value': {'@id': 'urn:value', '@type': coercion}}
        inputs.append((f'number/coerced/{coercion}/{token}', '{"@context":' + json.dumps(context) + ',"@id":"urn:subject","value":' + token + '}'))
for prefix, local in [
    ('urn:bia-ro-crate-validator:', 'rdflib-empty-datatype-native-0'),
    ('urn:bijux:', 'rdflib-literal-datatype'),
    ('urn:bijux:', 'rdflib-literal-datatype-double'),
    ('urn:bijux:', 'rdflib-literal-datatype-empty-iri'),
    ('urn:bijux:', 'rdflib-literal-datatype-native-0'),
    ('urn:bijux:', 'rdflib-malformed-datatype'),
]:
    for malformed in [False, True]:
        context = {'p': prefix, 'value': {'@id': 'urn:value', '@type': 'p:' + local}}
        document = {'@context': context, '@id': 'urn:subject', 'urn:native': 1.0, 'value': '1.0'}
        if malformed:
            document['@type'] = [1.0, True]
        inputs.append((f'number/context-datatype-isolation/{local}/{malformed}', json.dumps(document)))
for scope in ['property', 'type']:
    for datatype in ['@json', '@vocab', 'http://www.w3.org/2001/XMLSchema#double',
                     'http://www.w3.org/2001/XMLSchema#decimal', 'http://www.w3.org/2001/XMLSchema#string', 'urn:custom']:
        local = {'value': {'@id': 'urn:value', '@type': datatype}}
        context = {'outer': {'@id': 'urn:outer'}, 'Class': {'@id': 'urn:Class'}}
        context['outer' if scope == 'property' else 'Class']['@context'] = local
        nested = {'@id': 'urn:nested', 'value': 1.0}
        if scope == 'type':
            nested['@type'] = 'Class'
        document = {'@context': context, '@id': 'urn:subject', 'outer': nested}
        inputs.append((f'number/scoped/{scope}/{datatype}', json.dumps(document)))
        if datatype == '@json':
            nested['value'] = {'a': 1.0, '@id': 1, '@type': True, '@graph': -0.0}
            inputs.append((f'json/scoped/{scope}/reserved-payload', json.dumps(document)))
for types in [['Known', 'Class'], ['Class', 'Known']]:
    for datatype in ['@json', '@vocab']:
        context = {'Known': 'urn:Known', 'Class': {'@id': 'urn:Class', '@context': {
            'value': {'@id': 'urn:value', '@type': datatype}}}, 'value': 'urn:value'}
        document = {'@context': context, '@id': 'urn:subject', '@type': types, 'value': 1.0}
        inputs.append((f'number/type-order/{types[0]}/{datatype}', json.dumps(document)))
for scope in [None, {}, []]:
    context = {'Class': {'@id': 'urn:Class', '@context': scope}, 'value': 'urn:value'}
    document = {'@context': context, '@id': 'urn:subject', '@type': 'Class', 'value': 1.0}
    inputs.append((f'number/empty-type-context/{json.dumps(scope)}', json.dumps(document)))
context = {'Class': {'@id': 'urn:Class', '@context': {'value': {'@id': 'urn:value', '@type': '@vocab'}}},
           'value': 'urn:value', 'undefined': 'urn:undefined'}
inputs.append(('number/ordinary-undefined-key', json.dumps({
    '@context': context, '@id': 'urn:subject', 'undefined': 'Class', 'value': 1.0})))
rows = []
for name, source in inputs:
    try:
        graph = Graph().parse(data=source, format='json-ld')
    except Exception as error:
        expected = dict(error=type(error).__name__, message=str(error))
    else:
        terms = [[str(s), str(p), 'Literal' if hasattr(o, 'datatype') else 'NamedNode', str(o),
                  (str(o.datatype) if o.datatype is not None else None) if hasattr(o, 'datatype') else '', getattr(o, 'language', '') or '']
                 for s, p, o in graph]
        expected = dict(terms=sorted(terms, key=json.dumps))
    rows.append(dict(name=name, source=source, expected=expected))
args.output.write_text(json.dumps({'reference': reference['commit'], 'python': platform.python_version(),
                                  'rdflib': version('rdflib'), 'cases': rows}, indent=2) + '\n')
print(f'{len(rows)} native numeric and JSON term captures')
