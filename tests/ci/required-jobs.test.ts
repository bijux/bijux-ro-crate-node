import assert from 'node:assert/strict'
import test from 'node:test'
import {spawnSync} from 'node:child_process'

const runner = new URL('../../scripts/ci/require-jobs.mjs', import.meta.url)
function run(jobs: unknown, expected?: unknown) {
  const env:NodeJS.ProcessEnv = {...process.env, BIJUX_REQUIRED_JOBS: JSON.stringify(jobs)}
  delete env.BIJUX_EXPECTED_JOBS
  if (expected !== undefined) env.BIJUX_EXPECTED_JOBS = JSON.stringify(expected)
  return spawnSync(process.execPath, [runner.pathname], {encoding: 'utf8',
    env})
}
test('aggregate gates accept only successful prerequisite groups', () => {
  assert.equal(run({corpus: {result: 'success'}, interactions: {result: 'success'}}).status, 0)
  for (const result of ['skipped', 'cancelled', 'failure', undefined])
    assert.notEqual(run({corpus: {result}}).status, 0)
  assert.notEqual(run({}).status, 0)
})

test('an aggregate with an expected job set rejects missing, extra or invalid entries', () => {
  const complete = {packages:{result:'success'}, browsers:{result:'success'}}
  assert.equal(run(complete, ['packages','browsers']).status, 0)
  assert.notEqual(run({packages:{result:'success'}}, ['packages','browsers']).status, 0)
  assert.notEqual(run({...complete, extra:{result:'success'}}, ['packages','browsers']).status, 0)
  assert.notEqual(run(complete, ['packages','packages']).status, 0)
  assert.notEqual(run(complete, []).status, 0)
  assert.notEqual(run(complete, 'packages').status, 0)
  assert.notEqual(run(complete, ['packages',42]).status, 0)
  for (const result of ['skipped','cancelled','failure',undefined])
    assert.notEqual(run({packages:{result}, browsers:{result:'success'}}, ['packages','browsers']).status, 0)
})

test('repository validation rejects a missing or unsuccessful qualification group', () => {
  const names = ['packages','node-compatibility','reference','browsers']
  const complete = Object.fromEntries(names.map(name => [name, {result:'success'}]))
  assert.equal(run(complete, names).status, 0)
  for (const name of names) {
    const missing = {...complete}; delete missing[name]
    assert.notEqual(run(missing, names).status, 0, `missing ${name}`)
    for (const result of ['failure','cancelled','skipped'])
      assert.notEqual(run({...complete, [name]:{result}}, names).status, 0, `${name}: ${result}`)
  }
})
