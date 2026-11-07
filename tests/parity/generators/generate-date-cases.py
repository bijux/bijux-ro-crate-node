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
cases = []
for index, value in enumerate(values):
    try:
        parsed = adapter.validate_python(value)
        expected = dict(value=parsed.isoformat(), errors=[])
    except ValidationError as error:
        expected = dict(errors=[{k: e[k] for k in ('loc', 'msg', 'type')} for e in error.errors()])
    cases.append(dict(name=f'date boundary {index}: {value!r}', input=value, expected=expected))
destination = Path(__file__).parents[1] / 'expected/date-cases.json'
destination.write_text(json.dumps(cases, indent=2) + '\n')
print(f'{len(cases)} Pydantic date boundaries captured')
