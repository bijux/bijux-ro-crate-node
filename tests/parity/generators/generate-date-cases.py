"""Capture exact locked Pydantic date statuses, values and error diagnostics."""
from datetime import date
from importlib.metadata import version
import json
from pathlib import Path
from pydantic import TypeAdapter, ValidationError

assert version('pydantic-core') == '2.41.5'
adapter = TypeAdapter(date)
times = ['00:00', '0:00', '00:0', '00-00', '0a:00', '00:a0', '24:00', '00:60',
         '00:00:0', '00:00:00.', '00:00:00,', '00:00:00.0000009', '00:00:00.000001',
         '00:00:00.1234567', '00:00:60', '00:00Ztail', '00:00UTC', '00:00+0:00',
         '00:00+00:0', '00:00+000', '00:00+01', '00:00+24:00', '00:00+00:60',
         '00:00+01:00', '00:00−01:00', '00:00:00+01:00:00', '01:00', '00:00:01']
values = ['2024-01-01', '2023-02-29', '2024-02-29', '0000-01-01', '0000-01-01T00:00:00',
          '2024-00-01', '2024-13-01', '2024-01-00', '2024-01-32', '2024/01/01',
          '2024-1-01', '2024-01-1', '2024-01-01\n', ' 0 ', '+0', '-0', '1e20',
          'NaN', 'Infinity', True, None, {}, [], 0, 1, -1, 86400, 0.0000001, 0.0000009,
          -0.0000001, -0.0000009, 86400.0000001, 86400.0000009, 1e20, -1e20,
          -62167219200000, -62135596800000, 253402214400000, 253402300800000]
values += ['2024-01-01T' + value for value in times]
values += ['2024-01-01' + separator + '00:00' for separator in ['t', ' ', '_', '\n', 'x']]
values += [
    '.0', '0.', '86400.', '86400.e0',
    '.0e0', '+.0', '-.0', '1.e1',
    '1e0', '0e0', ' 0.', '0. ',
    '.', '0.e', '0.e+', '0.0_0',
    '0.0e999', '1.0e999', '-1.0e999', '1.e21',
    '1.e22', '-1.0e-999', '9223372036854775807.', '9223372036854775808.',
    '-9223372036854775808.', '000000000000000000000.', '253402300799999', '253402300799999.99',
    '253402300800000', '0000-01-01T', '0000-01-01T24:00:00', '0000-01-01T01:00:00',
    '0000-01-01x00:00', '0000-01-01T00:00Ztail',
]
# UTF-8 bounds precede component errors, including the accepted Unicode minus.
values += [
    'éééé', 'ééééé', '中中中',
    '中中中a', '🙂🙂a', '🙂🙂ab',
    '2024-0🙂', '2024-01-é', '2024-01-x',
    'xxxxx', '2024-01-01Téé', '2024-01-01Tééa',
    '2024-01-01Tééé', '2024-01-01T🙂', '2024-01-01T🙂a',
    '2024-01-01Txxx', '0000-01-01Téé', '0000-01-01Tééé',
    '2024-01-01T00:00−00:00', '2024-01-01T00:00−éé', '2024-01-01T00:00:é',
    '2024-01-01T00:00:00.é',
]
cases = []
for value in values:
    try:
        parsed = adapter.validate_python(value)
        expected = dict(value=parsed.isoformat(), errors=[])
    except ValidationError as error:
        expected = dict(errors=[{k: e[k] for k in ('loc', 'msg', 'type')} for e in error.errors()])
    cases.append(dict(name=f'date {value!r}', input=value, expected=expected))
destination = Path(__file__).parents[1] / 'expected/date-cases.json'
destination.write_text(json.dumps(cases, indent=2) + '\n')
print(f'{len(cases)} Pydantic date boundaries captured')
