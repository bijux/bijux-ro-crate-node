import assert from 'node:assert/strict'
import {runProcessGroups} from './process-groups.mjs'
import {browserInteractionGroups} from './browser-interactions.mjs'
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
const command = (path, args = [], env = {}) => ({command: process.execPath, args: [path, ...args], env})
if (group === 'corpus') {
  assert.ok(Object.keys(installed).every(key => !process.env[key]), 'Corpus runner owns both distribution bindings')
  await runProcessGroups([{}, installed].map(env => [
    command('tests/browser/parity.mjs', [], env),
    command('tests/browser/continuation-parity.mjs', [], env),
    command('tests/browser/metadata/literal-grammar.mjs', [], env),
    command('tests/browser/profile/inferred-collections.mjs', [], env),
    command('tests/browser/profile/collection-diagnostics.mjs', [], env),
    ...(!Object.keys(env).length && (!process.env.BIJUX_TEST_SHARD || process.env.BIJUX_TEST_SHARD.startsWith('0/'))
      ? [command('tests/reference/html-tree-building/dom-proof.mjs')] : []),
  ]), {cwd: root})
} else {
  assert.ok(!process.env.BIJUX_TEST_SHARD, 'Interaction guards must run in full')
  await runProcessGroups(browserInteractionGroups(command, process.env.BIJUX_TEST_INTERACTION), {cwd: root})
}
