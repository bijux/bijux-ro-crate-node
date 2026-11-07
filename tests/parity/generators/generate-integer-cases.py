"""Capture numeric coercion boundaries using the locked Pydantic primitive."""
import json
import hashlib
import math
from pathlib import Path
from importlib.metadata import version
from pydantic import TypeAdapter, ValidationError

assert version('pydantic-core') == '2.41.5'
adapter = TypeAdapter(int)
values = [None, True, False, 0, 1, -1, 1.5, {}, [], '0', '1', '-1', '+1', '00.0', '0_0',
          '0__0', '0_', '0__1', '0-1', '-0-1', '+0-1', '0+1', '0_.0', '1_0.0', '1_0.0_0',
          '1__0', '_1', '1_', '1e2', '1.1', '1.000', '\ufeff2', '\u00852', '\x1c2',
          '\u00a02', '\u20072', '\u30002', '2\ufeff', '2\u0085', '١٢', '１２']
values += [1e19, -1e19, 1e30, float(2**63), float(-(2**63)),
           math.nextafter(float(2**63), 0), math.nextafter(float(-(2**63)), 0),
           math.nextafter(float(-(2**63)), -math.inf)]
large = '9' * 4300
values += [large, large + '9', '-' + large, '+' + large, ' ' + large, large + ' ',
           large + '.0', large + '.1', large + '_0', '0' + large, '-' + '9' * 4299,
           '9' * 4301 + '.0', '+' + '9' * 4301, ' ' + '9' * 4301, '9' * 4301 + ' ',
           '9' * 4301 + '_', '0' * 5000 + '1', '1' + ' ' * 5000, '1_' * 2150 + '1']
cases = []
for value in values:
    try:
        parsed = adapter.validate_python(value)
        expected = dict(value=str(parsed), errors=[])
    except ValidationError as error:
        expected = dict(errors=[{k: e[k] for k in ('loc', 'msg', 'type')} for e in error.errors()])
    label = repr(value)
    if len(label) > 96:
        label = label[:48] + f'… ({len(value)} characters, SHA256 {hashlib.sha256(value.encode()).hexdigest()[:12]})'
    cases.append(dict(name='integer ' + label, input=value, expected=expected))
destination = Path(__file__).parents[1] / 'expected/integer-cases.json'
destination.write_text(json.dumps(cases, indent=2) + '\n')
print(f'{len(cases)} Pydantic integer boundaries captured')
