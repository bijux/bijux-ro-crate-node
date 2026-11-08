"""Capture locked pandas record boundaries independently of numeric inference."""
from io import StringIO
from itertools import product
from importlib.metadata import version
from pathlib import Path
import json
import pandas as pd

assert version('pandas') == '3.0.2'
inputs = ['file_path\tdataset\n' + before + ending + after for before, ending, after in product(
    ['x\t', 'x', 'x\tvalue'],
    ['\r', '\r\r', '\r\n', '\n\n', '\n\r', '\r\r\n', '\r\n\r', '\r \r', '\r\t\r', '\r\n\n'],
    ['\tother\n', '\t\tother\n', 'other\tz\n'])]
inputs += ['file_path\tdataset\nx\t\n other\n', '\r\tname\nvalue\n', '\n\tname\nvalue\n']
cases = []
for text in inputs:
    try:
        table = pd.read_csv(StringIO(text), sep='\t', dtype=str, keep_default_na=False)
        assert len(table) < 100, 'Unexpected record expansion in reference capture'
        expected = dict(names=table.columns.tolist(), rows=table.values.tolist())
    except pd.errors.ParserError as error:
        expected = dict(error=str(error))
    cases.append(dict(input=text, expected=expected))
destination = Path(__file__).parents[1] / 'expected/tsv-records.json'
destination.write_text(json.dumps(cases, indent=2) + '\n')
print(f'{len(cases)} pandas record boundaries captured')
