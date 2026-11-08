import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const [group, ...extra] = process.argv.slice(2)
assert.ok(['corpus', 'interaction'].includes(group) && !extra.length, 'Expected corpus or interaction')
const {name: core} = JSON.parse(await readFile(new URL('../../packages/core/package.json', import.meta.url)))
const {name: validator} = JSON.parse(await readFile(new URL('../../packages/validator/package.json', import.meta.url)))
const installed = {
  BIJUX_BROWSER_CORE_PATH: `/artifacts/consumers/validator/node_modules/${core}/dist/index.js`,
  BIJUX_BROWSER_VALIDATOR_PATH: `/artifacts/consumers/validator/node_modules/${validator}/dist/index.js`,
  BIJUX_BROWSER_SESSION_PATH: `/artifacts/consumers/validator/node_modules/${validator}/dist/browser.js`,
  BIJUX_BROWSER_WORKER_PATH: `/artifacts/consumers/validator/node_modules/${validator}/dist/worker.js`,
}
function run(path, args = [], env = {}) {
  const result = spawnSync(process.execPath, [path, ...args], {cwd: root, stdio: 'inherit',
    env: {...process.env, ...env}, timeout: 240000})
  assert.equal(result.status, 0, result.error?.message ?? `${path} exited ${result.signal ?? result.status}`)
}
if (group === 'corpus') {
  for (const env of [{}, installed]) {
    run('tests/browser/parity.mjs', [], env)
    run('tests/browser/continuation-parity.mjs', [], env)
  }
} else {
  assert.ok(!process.env.BIJUX_TEST_SHARD, 'Interaction guards must run in full')
  for (const path of ['profile-literal-policy', 'native-file-values', 'selected-colon-paths',
    'repair', 'races', 'session/termination', 'draft-editor', 'offline', 'report-display', 'workloads'])
    run(`tests/browser/${path}.mjs`)
  run('tests/package/consumers.mjs', ['--browser-guards'])
  run('tests/package/consumers.mjs', ['--browser-apps'])
}
