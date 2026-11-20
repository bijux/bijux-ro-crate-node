import assert from 'node:assert/strict'
import test from 'node:test'
import {collectRootTestLanes, partitionRootTests} from '../../../scripts/ci/root-test-shards.mjs'

test('root test lanes preserve every selected file exactly once', async () => {
  const {all, lanes} = await collectRootTestLanes()
  const files = Object.values(lanes).flat()
  assert.equal(new Set(files).size, files.length)
  assert.deepEqual([...files].sort(), [...all].sort())
  for (const lane of ['workspace-build', 'installed-workspaces', 'compiler-contract']) assert.equal(lanes[lane].length, 1)
})

test('root test lanes reject duplicate files and missing isolated tests', () => {
  assert.throws(() => partitionRootTests(['tests/tooling/build/workspace.test.ts', 'tests/tooling/build/workspace.test.ts']), /Duplicate/)
  assert.throws(() => partitionRootTests(['tests/ci/example.test.ts']), /Missing isolated root test/)
})
