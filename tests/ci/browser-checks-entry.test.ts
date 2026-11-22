import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const script = fileURLToPath(new URL('../../scripts/ci/browser-checks.mjs', import.meta.url))

function run(args: string[], overrides: NodeJS.ProcessEnv = {}) {
  const env = {...process.env}
  for (const name of ['BIJUX_TEST_SHARD', 'BIJUX_TEST_INTERACTION', 'BIJUX_BROWSER_CORE_PATH', 'BIJUX_BROWSER_VALIDATOR_PATH', 'BIJUX_BROWSER_SESSION_PATH', 'BIJUX_BROWSER_WORKER_PATH']) delete env[name]
  return spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {cwd: root, encoding: 'utf8', env: {...env, ...overrides}})
}

test('browser check entry rejects invalid lanes and conflicting distribution inputs before starting checks', () => {
  for (const args of [[], ['other'], ['corpus', 'extra']]) {
    const result = run(args)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Expected corpus or interaction/)
  }
  const corpus = run(['corpus'], {BIJUX_BROWSER_CORE_PATH: '/external.js'})
  assert.notEqual(corpus.status, 0)
  assert.match(corpus.stderr, /Corpus runner owns both distribution bindings/)
  const interaction = run(['interaction'], {BIJUX_TEST_SHARD: '0/4'})
  assert.notEqual(interaction.status, 0)
  assert.match(interaction.stderr, /Interaction guards must run in full/)
  const lane = run(['interaction'], {BIJUX_TEST_INTERACTION: 'other'})
  assert.notEqual(lane.status, 0)
  assert.match(lane.stderr, /BIJUX_TEST_INTERACTION must select a valid source or installed lane/)
})
