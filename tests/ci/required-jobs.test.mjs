import assert from 'node:assert/strict'
import test from 'node:test'
import {spawnSync} from 'node:child_process'

const runner = new URL('../../scripts/ci/require-jobs.mjs', import.meta.url)
function run(jobs) {
  return spawnSync(process.execPath, [runner.pathname], {encoding: 'utf8',
    env: {...process.env, BIJUX_REQUIRED_JOBS: JSON.stringify(jobs)}})
}
test('aggregate gates accept only successful prerequisite groups', () => {
  assert.equal(run({corpus: {result: 'success'}, interactions: {result: 'success'}}).status, 0)
  for (const result of ['skipped', 'cancelled', 'failure', undefined])
    assert.notEqual(run({corpus: {result}}).status, 0)
  assert.notEqual(run({}).status, 0)
})
