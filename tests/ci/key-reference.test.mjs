import assert from 'node:assert/strict'
import test from 'node:test'
import {referenceGroups} from '../../scripts/ci/reference-checks.mjs'

test('required defect qualification captures both key references and their primitive proof', () => {
  const commands = referenceGroups['upstream-defects']
  const find = args => commands.findIndex(command => JSON.stringify(command.args) === JSON.stringify(args))
  const positions = [
    ['tests/reference/key-equality/capture.py'],
    ['tests/reference/key-equality/verify-capture.mjs', 'original', 'artifacts/reports/key-equality-original.json'],
    ['tests/reference/key-equality/capture.py', '--corrected'],
    ['tests/reference/key-equality/verify-capture.mjs', 'corrected', 'artifacts/reports/key-equality-corrected.json'],
    ['tests/reference/key-equality/capture-primitive.py'],
    ['tests/reference/key-equality/primitive.json', 'artifacts/reports/key-equality-primitive.json'],
    ['tests/reference/key-equality/test_capture_scope.py'],
    ['tests/reference/upstream-defects/run.mjs'],
  ].map(find)
  assert.ok(positions.every(index => index >= 0), 'Every key capture/proof must precede the aggregate validator')
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b))
  for (const index of [positions[0], positions[2]]) {
    assert.equal(commands[index].stdin, 'tests/reference/key-equality/inputs.json')
    assert.equal(commands[index].env.PYTHONHASHSEED, '0')
  }
  assert.equal(commands[positions[0]].stdout, 'artifacts/reports/key-equality-original.json')
  assert.equal(commands[positions[2]].stdout, 'artifacts/reports/key-equality-corrected.json')
  assert.equal(commands[positions[4]].stdout, 'artifacts/reports/key-equality-primitive.json')
})
