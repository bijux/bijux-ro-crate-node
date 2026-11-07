"""Capture pandas' explicit and generated TSV header ownership."""
from importlib.metadata import version
from io import StringIO
from pathlib import Path
import csv
import json
import pandas as pd

assert version('pandas') == '3.0.2'
headers = [
    ['', 'Unnamed: 0'], ['file_path', '', 'Unnamed: 1', 'dataset'],
    ['', 'Unnamed: 0', 'Unnamed: 0.1'], ['', '', 'Unnamed: 0', 'Unnamed: 1'],
    ['file_path', 'dataset', 'dataset.1', 'dataset'], ['path', 'path.1', 'path.1', 'path'],
    [''], ['', '', ''], ['path', 'path', 'path.1'],
]
cases = []
for header in headers:
    stream = StringIO()
    writer = csv.writer(stream, delimiter='\t', lineterminator='\n')
    writer.writerow(header)
    writer.writerow([f'cell{index}' for index in range(len(header))])
    table = pd.read_csv(StringIO(stream.getvalue()), sep='\t')
    cases.append(dict(name=repr(header), input=stream.getvalue(),
                      names=list(table.columns), row=table.iloc[0].tolist()))
destination = Path(__file__).parents[1] / 'expected/tsv-headers.json'
destination.write_text(json.dumps(cases, indent=2) + '\n')
print(f'{len(cases)} pandas header controls captured')
