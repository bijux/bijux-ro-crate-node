"""Capture complete TSV row hashes through the locked reference's file reader."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root / 'tests/parity/expected/tokenizer-records.json')
args = parser.parse_args()
subprocess.run([sys.executable, str(root / 'scripts/reference/verify-environment.py')],
               check=True, stdout=subprocess.DEVNULL)
import pandas as pd

reference = json.loads((root / 'docs/compatibility/reference.json').read_text())
inputs = json.loads((root / 'tests/parity/tokenizer/inputs.json').read_text())['cases']
assert len({item['name'] for item in inputs}) == len(inputs)
path = root / 'artifacts/work/tokenizer-capture.tsv'
path.parent.mkdir(parents=True, exist_ok=True)
rows = []
for item in inputs:
    text = ''.join(part['text'] * part.get('repeat', 1) for part in item['parts'])
    content = text.encode('utf-8')
    path.write_bytes(content)
    try:
        # The unmodified parser passes a path and leaves encoding/low_memory at
        # defaults. TextIO character-buffer boundaries are observable here.
        table = pd.read_csv(path, sep='\t', dtype=str, keep_default_na=False)
    except pd.errors.ParserError as error:
        expected = {'error': str(error)}
    else:
        digest = hashlib.sha256()
        for row in table.itertuples(index=False, name=None):
            assert all(isinstance(value, str) for value in row)
            digest.update(json.dumps(row, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
            digest.update(b'\n')
        expected = {'names': table.columns.tolist(), 'count': len(table), 'rows_sha256': digest.hexdigest()}
    assert path.read_bytes() == content
    rows.append({'name': item['name'], 'input_sha256': hashlib.sha256(content).hexdigest(), 'expected': expected})
args.output.write_text(json.dumps({'reference': reference['commit'], 'python': platform.python_version(),
                                  'pandas': pd.__version__, 'cases': rows}, indent=2) + '\n')
print(f'{len(rows)} complete tokenizer record captures')
