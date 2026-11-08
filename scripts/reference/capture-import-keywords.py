"""Capture imported context keywords through the pinned RDFLib and PyLD APIs."""
import argparse
import contextlib
import copy
import hashlib
import io
import json
from pathlib import Path
import runpy

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root / 'tests/parity/expected/import-keywords.json')
args = parser.parse_args()
with contextlib.redirect_stdout(io.StringIO()):
    environment = runpy.run_path(str(Path(__file__).with_name('verify-environment.py')))

from rdflib import BNode, Graph, Literal
from rdflib.plugins.shared.jsonld import context
import pyld.jsonld
from pyld.context_resolver import ContextResolver

source = (root / 'tests/parity/contexts/import-keywords.json').read_bytes()
items = json.loads(source)['cases']
assert len({item['name'] for item in items}) == len(items)
rows = []
original = context.source_to_json


def term(value):
    if isinstance(value, Literal):
        datatype = None if value.datatype is None else str(value.datatype)
        return ['Literal', str(value), datatype, value.language or '']
    return ['BlankNode' if isinstance(value, BNode) else 'NamedNode', str(value)]


def failure(error):
    return {'type': type(error).__name__, 'code': getattr(error, 'code', None),
            'message': error.args[0] if error.args else str(error)}


try:
    for item in items:
        def resource(url):
            value = copy.deepcopy(item['contexts'][str(url)])
            return json.loads(value) if isinstance(value, str) else value

        def load(url, *args, **kwargs):
            return resource(url), None

        context.source_to_json = load
        row = {'name': item['name']}
        if item['mode'] == 'both':
            try:
                graph = Graph().parse(data=json.dumps(item['document']), format='json-ld', publicID=item['base'])
            except Exception as error:
                row['rdf'] = {'exception': failure(error)}
            else:
                triples = [[term(s), term(p), term(o)] for s, p, o in graph]
                triples.sort(key=lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':')))
                row['rdf'] = {'triples': triples}

        def loader(url, options=None):
            return {'contextUrl': None, 'documentUrl': url, 'document': resource(url)}

        # Fixture loaders own independent immutable responses, including reused URLs.
        resolver = ContextResolver({}, loader)
        try:
            expanded = pyld.jsonld.expand(copy.deepcopy(item['document']), {
                'base': item['base'], 'documentLoader': loader, 'contextResolver': resolver})
        except Exception as error:
            row['standard'] = {'exception': failure(error)}
        else:
            row['standard'] = {'expanded': expanded}
        rows.append(row)
finally:
    context.source_to_json = original

args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps({
    'reference': environment['commit'], 'python': environment['platform'].python_version(),
    'rdflib': environment['versions']['rdflib'], 'pyld': environment['versions']['pyld'],
    'inputs_sha256': hashlib.sha256(source).hexdigest(), 'cases': rows,
}, indent=2) + '\n')
