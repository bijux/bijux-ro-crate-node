import assert from 'node:assert/strict'
import test from 'node:test'
import {spawnSync} from 'node:child_process'

test('upstream pytest partitions select every collected case exactly once', () => {
  const program = `
import importlib.util
from types import SimpleNamespace
spec = importlib.util.spec_from_file_location('upstream_shards', 'scripts/reference/upstream-shards.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
cases = [SimpleNamespace(nodeid=f'test/example.py::test_case_{i}') for i in range(200)]
selected = []
for index in range(4):
    items = list(cases)
    deselected = []
    config = SimpleNamespace(hook=SimpleNamespace(pytest_deselected=lambda items: deselected.extend(items)))
    module.Partition(index, 4).pytest_collection_modifyitems(None, config, items)
    assert len(items) + len(deselected) == len(cases)
    selected.extend(item.nodeid for item in items)
assert len(selected) == len(cases)
assert set(selected) == {item.nodeid for item in cases}
try:
    module.Partition(4, 4)
    raise AssertionError('invalid partition accepted')
except ValueError:
    pass
`
  const result = spawnSync('python3', ['-B', '-c', program], {encoding: 'utf8'})
  assert.equal(result.status, 0, result.stderr)
})
