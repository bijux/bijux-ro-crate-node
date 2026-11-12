"""Capture the merged prefix and supported-container behavior without correction."""
import io
import json
from pathlib import Path
import runpy
import sys

folder = Path(__file__).resolve().parent
request = json.load(sys.stdin)
encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
assert encode(request) == encode(json.loads((folder / 'inputs.json').read_text())), 'Exact registered model inputs required'
sys.path.insert(0, str(folder.parents[2] / 'tests/parity'))
sys.stdin = io.StringIO(encode(request))
runpy.run_path(str(folder.parents[2] / 'tests/parity/oracle.py'), run_name='__main__')
