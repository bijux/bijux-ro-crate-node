"""Recapture bounded RDF observations using the locked Python dependencies."""
import argparse
import contextlib
import hashlib
import importlib.metadata
import inspect
import io
import json
from pathlib import Path
import platform
import runpy
import sys
import urllib.parse

from rdflib import BNode, Graph, URIRef
from rdflib.plugins.shared.jsonld import context, util

root = Path(__file__).resolve().parents[6]
folder = Path(__file__).parent
arguments = argparse.ArgumentParser(description=__doc__)
arguments.add_argument('--output', type=Path, default=Path('artifacts/reports/rdf-base-schemes.json'))
options = arguments.parse_args()
fixture = json.loads((folder / 'base-schemes.json').read_text())
sys.path.insert(0, str(root / 'scripts/reference'))
with contextlib.redirect_stdout(io.StringIO()):
    environment = runpy.run_path(str(root / 'scripts/reference/verify-environment.py'))
commit = environment['commit']
functions = {
    'RDFLib.norm_url': util.norm_url,
    'Context.resolve': context.Context.resolve,
    'Context.base': context.Context.base.fset,
    'urllib.urljoin': urllib.parse.urljoin,
    'urllib.urlparse': urllib.parse.urlparse,
    'urllib.urlsplit': urllib.parse.urlsplit,
    'urllib.urlunsplit': urllib.parse.urlunsplit,
    'urllib._splitparams': urllib.parse._splitparams,
}
fixture['reference'] = {
    'commit': commit,
    'python': platform.python_version(),
    'rdflib': importlib.metadata.version('rdflib'),
    'functions': {name: hashlib.sha256(inspect.getsource(fn).encode()).hexdigest()
                  for name, fn in functions.items()},
    'tables': {name: getattr(urllib.parse, name) for name in
               ['uses_relative', 'uses_netloc', 'uses_params', 'uses_query', 'uses_fragment']},
}


def term(value):
    kind = 'BlankNode' if isinstance(value, BNode) else 'NamedNode' if isinstance(value, URIRef) else 'Literal'
    return [kind, str(value)]


for row in fixture['cases']:
    graph = Graph().parse(data=json.dumps(row['document']), format='json-ld',
                          publicID='file:///crate/ro-crate-metadata.json')
    row['expected'] = sorted([[term(s), term(p), term(o)] for s, p, o in graph])

options.output.parent.mkdir(parents=True, exist_ok=True)
options.output.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + '\n')
