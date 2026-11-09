"""Qualify both C accumulation profiles and observe the locked pandas wheel."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import platform
import shutil
import struct
import subprocess
import sys
import tempfile

import pandas as pd

root = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root / 'artifacts/reports/manifest-numeric-arithmetic.json')
args = parser.parse_args()
subprocess.run([sys.executable, str(root / 'scripts/reference/verify-environment.py')], check=True, stdout=subprocess.DEVNULL)
folder = Path(__file__).resolve().parent
proof = json.loads((folder / 'arithmetic.json').read_text())
assert pd.__version__ == proof['pandas']
body = (folder / 'precise-xstrtod.c').read_bytes()
assert hashlib.sha256(body).hexdigest() == proof['source']['function_sha256']
source = body.decode()
operation = "number = number * 10. + (*p - '0');"
assert source.count(operation) == 2
source = source.replace(operation, "number = BIJUX_ACCUMULATE(number, (*p - '0'));")
prefix = r'''#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#include <errno.h>
#define PD_FALLTHROUGH __attribute__((fallthrough))
#define isdigit_ascii(c) ((c)>='0' && (c)<='9')
#define isspace_ascii(c) ((c)==' ' || ((c)>='\t' && (c)<='\r'))
#define toupper_ascii(c) (((c)>='a' && (c)<='z') ? (c)-32 : (c))
#define checked_add(a,b,out) __builtin_add_overflow((a),(b),(out))
#ifdef BIJUX_FUSED
#define BIJUX_ACCUMULATE(a,d) fma((a),10.,(d))
#else
#define BIJUX_ACCUMULATE(a,d) ((a)*10.+(d))
#endif
'''
suffix = r'''int main(void) {
  char *text = NULL; size_t size = 0;
  while (getline(&text, &size, stdin) > 0) {
    text[strcspn(text, "\n")] = 0;
    int error = 0, maybe_int = 0; char *end;
    double number = precise_xstrtod(text, &end, '.', 'E', 0, 1, &error, &maybe_int);
    uint64_t bits; memcpy(&bits, &number, sizeof bits);
    printf("%016llx\n", (unsigned long long)bits);
  }
  free(text); return 0;
}
'''
compiler = shutil.which('cc')
assert compiler, 'A C compiler is required to independently qualify the parser arithmetic'
work = root / 'artifacts/work'
work.mkdir(parents=True, exist_ok=True)
values = [value for case in proof['cases'] for value in case['values']]
with tempfile.TemporaryDirectory(prefix='manifest-numeric-', dir=work) as directory:
    path = Path(directory)
    c_source = path / 'accumulation.c'
    c_source.write_text(prefix + source + suffix)
    for profile in ['separate', 'fused']:
        binary = path / profile
        command = [compiler, '-O2', '-ffp-contract=off', str(c_source), '-lm', '-o', str(binary)]
        if profile == 'fused':
            command.insert(1, '-DBIJUX_FUSED')
        subprocess.run(command, check=True, timeout=30, capture_output=True)
        actual = subprocess.check_output([str(binary)], input=('\n'.join(values) + '\n').encode(), timeout=10).decode().splitlines()
        expected = [bits for case in proof['cases'] for bits in case[profile]]
        assert actual == expected, f'Independent C {profile} values differ'

observed = []
for case in proof['cases']:
    text = 'value\n' + ''.join('"' + value.replace('"', '""') + '"\n' for value in case['values'])
    column = pd.read_csv(io.StringIO(text), sep='\t')['value']
    observed.append([struct.pack('>d', value).hex() for value in column])
profiles = [name for name in ['separate', 'fused'] if observed == [case[name] for case in proof['cases']]]
assert len(profiles) == 1, 'The pandas wheel does not match either independently qualified arithmetic profile'
report = {'pandas': pd.__version__, 'python': platform.python_version(), 'platform': platform.platform(),
          'architecture': platform.machine(), 'profile': profiles[0], 'cases': len(proof['cases']),
          'c_source_sha256': hashlib.sha256(body).hexdigest(), 'c_profiles_verified': ['separate', 'fused'],
          'observed': observed}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, indent=2) + '\n')
print(f"{len(proof['cases'])} independent C/pandas arithmetic cases: {profiles[0]}")
