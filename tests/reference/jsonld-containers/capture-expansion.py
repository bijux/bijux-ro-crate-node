"""Capture unchanged pinned PyLD expansion of registered container documents."""
import argparse
import copy
import hashlib
import json
from importlib.metadata import version
from pathlib import Path
from pyld import jsonld
from rdflib import Graph, RDF

folder = Path(__file__).parent
parser = argparse.ArgumentParser()
parser.add_argument('--types', action='store_true')
args = parser.parse_args()
source = folder / ('type-documents.json' if args.types else 'graph-documents.json')
cases = json.loads(source.read_text())['cases']
assert version('PyLD') == '2.0.4'
rows = []
for item in cases:
    jsonld._resolved_context_cache.clear()
    jsonld._inverse_context_cache.clear()
    row = {'name': item['name'], 'expanded': jsonld.expand(copy.deepcopy(item['document']),
           {'base': 'file:///crate/ro-crate-metadata.json'})}
    if args.types:
        assert version('rdflib') == '7.6.0'
        graph = Graph().parse(data=json.dumps(item['document']), format='json-ld',
                              publicID='file:///crate/ro-crate-metadata.json')
        row['rdf_types'] = sorted({str(value) for value in graph.objects(None, RDF.type)})
    rows.append(row)
print(json.dumps({'pyld': version('PyLD'), 'inputs_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                  'cases': rows}, ensure_ascii=False, indent=2))
