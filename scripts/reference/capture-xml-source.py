"""Capture XML literal source conversion through the unchanged locked RDFLib."""
import argparse
import hashlib
from importlib.metadata import version
import json
import logging
from pathlib import Path
import platform
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--inputs', type=Path, default=root / 'tests/parity/xml-source/inputs.json')
parser.add_argument('--output', type=Path, default=root / 'tests/parity/expected/xml-source-identities.json')
args = parser.parse_args()
subprocess.run([sys.executable, str(root / 'scripts/reference/verify-environment.py')],
               check=True, stdout=subprocess.DEVNULL)
from rdflib import Literal, RDF
logging.disable(logging.CRITICAL)
reference = json.loads((root / 'docs/compatibility/reference.json').read_text())
inputs = json.loads(args.inputs.read_text())['values']
assert len({item['input'] for item in inputs}) == len(inputs)
values = []
for item in inputs:
    literal = Literal(item['input'], datatype=RDF.XMLLiteral)
    values.append({'input': item['input'], 'canonical': str(literal), 'converted': literal.value is not None})
args.output.write_text(json.dumps({'reference': reference['commit'], 'python': platform.python_version(),
                                  'rdflib': version('rdflib'),
                                  'input_sha256': hashlib.sha256(args.inputs.read_bytes()).hexdigest(),
                                  'values': values}, indent=2) + '\n')
print(f'{len(values)} XML source identities captured')
