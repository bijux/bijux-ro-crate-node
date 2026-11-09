"""Capture unchanged pinned PyLD expansion of registered container documents."""
import copy
import hashlib
import json
from importlib.metadata import version
from pathlib import Path
from pyld import jsonld

folder = Path(__file__).parent
source = folder / 'graph-documents.json'
cases = json.loads(source.read_text())['cases']
assert version('PyLD') == '2.0.4'
rows = []
for item in cases:
    jsonld._resolved_context_cache.clear()
    jsonld._inverse_context_cache.clear()
    rows.append({'name': item['name'], 'expanded': jsonld.expand(copy.deepcopy(item['document']),
                 {'base': 'file:///crate/ro-crate-metadata.json'})})
print(json.dumps({'pyld': version('PyLD'), 'inputs_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                  'cases': rows}, ensure_ascii=False, indent=2))
