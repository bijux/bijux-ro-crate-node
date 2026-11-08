"""Capture the locked RDFLib namespace manager and pySHACL URI labels."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root / 'tests/parity/expected/rdf-namespaces.json')
parser.add_argument('--write-runtime-data', action='store_true')
args = parser.parse_args()
subprocess.run([sys.executable, str(root / 'scripts/reference/verify-environment.py')],
               check=True, stdout=subprocess.DEVNULL)
import rdflib
from pyshacl.rdfutil.stringify import stringify_node
from pyshacl.rdfutil.inoculate import inoculate

reference = json.loads((root / 'docs/compatibility/reference.json').read_text())
defaults = [[prefix, str(namespace)] for prefix, namespace in rdflib.Graph().namespaces()]
runtime = root / 'packages/validator/src/metadata/rdf/namespaces/defaults.json'
if args.write_runtime_data:
    runtime.write_text(json.dumps(defaults, indent=2) + '\n')
else:
    assert json.loads(runtime.read_text()) == defaults
source = root / 'tests/parity/namespaces/inputs.json'
specification = json.loads(source.read_text())
inputs = specification['cases']
cases = []
for item in inputs:
    graph = rdflib.Graph()
    if 'document' in item:
        graph.parse(data=item['document'], format='json-ld', publicID='file:///crate/ro-crate-metadata.json')
    else:
        for prefix, namespace in item['bindings']:
            graph.bind(prefix, namespace)
    if item.get('ontology_defaults'):
        inoculate(graph, rdflib.Graph())
    labels = [stringify_node(graph, rdflib.URIRef(uri), ns_manager=graph.namespace_manager)
              for uri in specification['uri_sets'][item['uri_set']]]
    bindings = [[prefix, str(namespace)] for prefix, namespace in graph.namespaces()]
    binding_bytes = json.dumps(bindings, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    cases.append({'name': item['name'], 'labels': labels, 'bindings_count': len(bindings),
                  'bindings_sha256': hashlib.sha256(binding_bytes).hexdigest()})
args.output.write_text(json.dumps({'reference': reference['commit'], 'python': platform.python_version(),
    'rdflib': rdflib.__version__, 'input_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'cases': cases}, indent=2) + '\n')
print(f'{len(cases)} namespace binding scenarios and {sum(len(item["labels"]) for item in cases)} URI labels captured')
