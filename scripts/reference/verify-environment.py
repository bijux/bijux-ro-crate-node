"""Verify the independently installed Python oracle and its locked inputs."""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import subprocess
import bia_ro_crate
from dependency_integrity import verify_installed_files

root = Path(__file__).resolve().parents[2]
reference = json.loads((root / 'docs/compatibility/reference.json').read_text())
assert platform.python_version() == reference['python'], 'Unexpected oracle Python interpreter'
source = Path(bia_ro_crate.__file__).resolve().parents[2]
commit = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
assert commit == reference['commit'], 'Unexpected oracle source'
subprocess.run(['git', '-C', str(source), 'diff', 'HEAD', '--quiet'], check=True)
assert not subprocess.check_output(['git', '-C', str(source), 'ls-files', '--others', '--exclude-standard', '--', 'src'], text=True)
for name, expected in reference['inputs'].items():
    assert hashlib.sha256((source / name).read_bytes()).hexdigest() == expected, name
versions = {}
integrity = {}
for line in (root / 'tests/parity/requirements-oracle.txt').read_text().splitlines():
    if '==' not in line:
        continue
    name, expected = line.split('==')
    actual = importlib.metadata.version(name)
    assert actual == expected, f'{name}: {actual} != {expected}'
    versions[name] = actual
    integrity[name] = verify_installed_files(importlib.metadata.distribution(name))
print(json.dumps({'commit': commit, 'python': platform.python_version(),
                  'imported_package': str(Path(bia_ro_crate.__file__).resolve()),
                  'versions': versions, 'installed_integrity': integrity}, indent=2))
