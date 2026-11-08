"""Capture locked pandas column inference, including conversion failure order."""
from importlib.metadata import version
from itertools import permutations
from io import StringIO
from pathlib import Path
import csv
import hashlib
import json
import pandas as pd

assert version('pandas') == '3.0.2'
groups = [
    ['9223372036854775808', '18446744073709551616', '018446744073709551616'],
    ['1', '1.0', '18446744073709551616'], ['-0', '0', '18446744073709551615'],
    ['-0', 'NA', '18446744073709551615'], ['0', 'NA', '18446744073709551615'],
    ['18446744073709551616', '1_0', '10'], ['18446744073709551616 ', '1.0', '1'],
    ['9223372036854775807', '9223372036854775808', '-1'],
    ['-9223372036854775808', '-9223372036854775809', 'NA'],
    ['18446744073709551616', 'word', 'NA'], ['True', 'False', 'NA'],
]
inputs = [list(values) for group in groups for values in permutations(group)]
inputs += [[], ['NA', 'NA'], ['001', 'NA', '2'], ['9007199254740993', '9223372036854775807'],
           ['0.30000000000000004', '0.3'], ['0e309', '0.0'], ['1e309', 'inf'],
           ['18446744073709551615', 'NA'], ['-0', '0'],
           ['18446744073709551616', '0' * 5000 + '1'], ['0' * 5000 + '1', '18446744073709551616']]
inputs += [[token, '1', '1.0'] for word in ['inf', 'INF', 'Infinity', '+infinity', '-Infinity']
           for space in [' ', '\t', '\n', '\r', '\v', '\f'] for token in [space + word, word + space]]
inputs += [[word, '1', '1.0'] for word in ['inf', 'INF', 'Infinity', '+infinity', '-Infinity']]
inputs += [[space + '1.0' + space, '1', '2'] for space in [' ', '\t', '\n', '\r', '\v', '\f']]
# Check computed scaling exponents, including fractional digits, rather than
# just the explicit exponent token. The C converter has distinct zero branches.
inputs += [[f'{sign}{mantissa}e{exponent}', '1.0']
           for sign in ['', '-'] for mantissa in ['0', '1']
           for exponent in [-999, -617, -616, -324, -309, -308, 0, 308, 309, 616]]
inputs += [[word, '1.0'] for word in ['-0.0e-616', '-0.000e309', '-0.000e312', '-1.0e-616']]
cases = []
for values in inputs:
    stream = StringIO()
    writer = csv.writer(stream, delimiter='\t', lineterminator='\n')
    writer.writerow(['value', 'other'])
    writer.writerows([value, 'control'] for value in values)
    series = pd.read_csv(StringIO(stream.getvalue()), sep='\t')['value']
    kind = {'i': 'integer', 'u': 'unsigned', 'f': 'float', 'b': 'boolean'}.get(series.dtype.kind,
            'string' if isinstance(series.dtype, pd.StringDtype) else 'object')
    normalized = []
    for value in series.tolist():
        if pd.isna(value):
            normalized.append(dict(type='missing'))
        elif isinstance(value, bool):
            normalized.append(dict(type='boolean', value=value))
        elif isinstance(value, int):
            normalized.append(dict(type='integer', value=str(value)))
        elif isinstance(value, float):
            normalized.append(dict(type='float', value=repr(value)))
        else:
            normalized.append(dict(type='string', value=value))
    label = repr(values)
    if len(label) > 160:
        label = 'long integer input ' + hashlib.sha256(json.dumps(values).encode()).hexdigest()[:12]
    cases.append(dict(name=label, input=values, expected=dict(kind=kind, values=normalized)))
destination = Path(__file__).parents[1] / 'expected/manifest-values.json'
destination.write_text(json.dumps(cases, indent=2) + '\n')
print(f'{len(cases)} pandas column controls captured')
