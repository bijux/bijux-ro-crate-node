import assert from 'node:assert/strict'
import test from 'node:test'
import {collectRootTestLanes, expandRootTestCommand} from '../../scripts/ci/root-test-shards.mjs'

test('root test lanes preserve every selected file exactly once', async () => {
  const {all, lanes} = await collectRootTestLanes()
  const files = Object.values(lanes).flat()
  assert.equal(new Set(files).size, files.length)
  assert.deepEqual([...files].sort(), [...all].sort())
  for (const lane of ['workspace-build', 'installed-workspaces', 'compiler-contract']) assert.equal(lanes[lane].length, 1)
})

test('root test selection fails closed when the npm command no longer has its expected shape', async () => {
  await assert.rejects(expandRootTestCommand('node something-else'), /root test command/)
  await assert.rejects(expandRootTestCommand('node --import tsx --test tests/ci/*.unknown'), /Unsupported root test pattern/)
})
