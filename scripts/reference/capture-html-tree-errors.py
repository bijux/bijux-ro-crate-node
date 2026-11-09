"""Capture strict heading/formatting boundaries through unchanged RDFLib."""
import argparse
import hashlib
import json
import logging
from importlib.metadata import version
from pathlib import Path
import platform
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root / 'tests/parity/expected/html-tree-errors.json')
args = parser.parse_args()
subprocess.run([sys.executable, str(root / 'scripts/reference/verify-environment.py')], check=True, stdout=subprocess.DEVNULL)
from rdflib import Literal, RDF
logging.disable(logging.CRITICAL)
source = root / 'tests/parity/html/tree-errors.json'
inputs = json.loads(source.read_text())['inputs']
rows = []
for text in inputs:
    term = Literal(text, datatype=RDF.HTML)
    rows.append({'input': text, 'canonical': str(term), 'converted': term.value is not None})
reference = json.loads((root / 'docs/compatibility/reference.json').read_text())
args.output.write_text(json.dumps({'reference': reference['commit'], 'python': platform.python_version(),
    'rdflib': version('rdflib'), 'html5rdf': version('html5rdf'),
    'input_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'values': rows}, indent=2) + '\n')
print(f'{len(rows)} strict HTML tree-boundary identities captured')
