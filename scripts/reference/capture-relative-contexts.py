"""Capture relative RDF mappings through the untouched pinned parser."""
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
parser.add_argument('--inputs', type=Path, default=root / 'tests/parity/contexts/relative-mappings.json')
parser.add_argument('--output', type=Path, default=root / 'tests/parity/expected/relative-contexts.json')
args = parser.parse_args()
with contextlib.redirect_stdout(io.StringIO()):
    environment = runpy.run_path(str(Path(__file__).with_name('verify-environment.py')))

from rdflib import BNode, Graph, Literal
import pyld.jsonld
from rdflib.plugins.shared.jsonld import context

source = args.inputs.read_bytes()
cases = json.loads(source)['cases']
assert len({item['name'] for item in cases}) == len(cases)
rows = []
original = context.source_to_json


def term(value):
    if isinstance(value, Literal):
        datatype = None if value.datatype is None else str(value.datatype)
        return ['Literal', str(value), datatype, value.language or '']
    return ['BlankNode' if isinstance(value, BNode) else 'NamedNode', str(value)]


try:
    for case in cases:
        def load(url, *args, **kwargs):
            document = copy.deepcopy(case['contexts'][str(url)])
            return (json.loads(document) if isinstance(document, str) else document), None

        context.source_to_json = load
        try:
            graph = Graph().parse(data=json.dumps(case['document']), format='json-ld', publicID=case['base'])
        except Exception as error:
            rows.append({'name': case['name'], 'exception': {'type': type(error).__name__, 'message': str(error)}})
        else:
            triples = [[term(s), term(p), term(o)] for s, p, o in graph]
            triples.sort(key=lambda row: json.dumps(row, ensure_ascii=False, separators=(',', ':')))
            rows.append({'name': case['name'], 'triples': triples})
        if case.get('standard_control'):
            rows[-1]['standard_expanded'] = pyld.jsonld.expand(copy.deepcopy(case['document']), {'base': case['base']})
finally:
    context.source_to_json = original

args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps({
    'reference': environment['commit'],
    'python': environment['platform'].python_version(),
    'rdflib': environment['versions']['rdflib'],
    'inputs_sha256': hashlib.sha256(source).hexdigest(),
    'cases': rows,
}, indent=2) + '\n')
