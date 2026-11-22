import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {browserInteractionGroups} from '../../scripts/ci/browser-interactions.mts'
import {selectInstalledGuardGroups} from '../package/validator/guard-selection.mjs'

const command = (path: string, args: string[] = [], env: NodeJS.ProcessEnv = {}) => ({path, args, env})
const key = (command: {path: string; args: string[]}) => [command.path, ...command.args].join(' ')

test('interaction lanes partition every existing source guard and installed consumer check', () => {
  const all = browserInteractionGroups(command)
  const source = browserInteractionGroups(command, 'source')
  const installed = browserInteractionGroups(command, 'installed')
  assert.equal(all.length, 2)
  assert.deepEqual([...source, ...installed], all)
  assert.equal(new Set(all.flat().map(key)).size, 20)
  assert.deepEqual(source[0].map(item => item.path), [
    'manifest/numeric-identity', 'metadata/urls', 'metadata/reserved-types', 'metadata/model-type-prefixes', 'upstream-defects', 'native-file-values',
    'text-file-values', 'file-path-ownership', 'selected-colon-paths', 'root-identity',
    'repair', 'races', 'session/termination', 'session/completion', 'draft-editor', 'offline', 'report-display', 'workloads',
  ].map(path => 'tests/browser/' + path + '.mjs'))
  assert.deepEqual(installed[0].map(key), [
    'tests/package/consumers.mjs --browser-guards',
    'tests/package/consumers.mjs --browser-apps',
  ])
  const partitions = ['source-0', 'source-1', 'source-2'].flatMap(lane => browserInteractionGroups(command, lane).flat())
  assert.deepEqual(partitions.map(key).sort(), source.flat().map(key).sort())
  assert.equal(new Set(partitions.map(key)).size, source.flat().length)
  const installedPartitions = ['installed-references', 'installed-sessions', 'installed-inputs', 'installed-apps'].flatMap(lane => browserInteractionGroups(command, lane).flat())
  assert.deepEqual(installedPartitions.map(item => [key(item), item.env.BIJUX_TEST_INSTALLED_GUARD]), [
    ['tests/package/consumers.mjs --browser-guards', 'references'], ['tests/package/consumers.mjs --browser-guards', 'sessions'],
    ['tests/package/consumers.mjs --browser-guards', 'inputs'], ['tests/package/consumers.mjs --browser-apps', undefined],
  ])
})

test('installed guard partitions cover every group exactly once and reject invalid selection', () => {
  const groups = ['references', 'sessions', 'inputs']
  assert.deepEqual(selectInstalledGuardGroups(groups), groups)
  assert.deepEqual(['references', 'sessions', 'inputs'].flatMap(lane => selectInstalledGuardGroups(groups, lane)), groups)
  for (const lane of ['', '3', '-1', '01']) assert.throws(() => selectInstalledGuardGroups(groups, lane), /guard partition/i)
})

test('unknown interaction selectors cannot skip qualification or start commands', () => {
  // Invalid selectors deliberately cross the static boundary.
  for (const lane of ['', 'all', 'consumer', 'installed/source', 'source-3', 'source-01', null, 0]) {
    let calls = 0
    assert.throws(() => browserInteractionGroups(() => {calls++}, lane as never), /BIJUX_TEST_INTERACTION/)
    assert.equal(calls, 0)
  }
})

test('interaction workflow runs every engine and distribution with distinct artifacts', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/validation.yml', import.meta.url), 'utf8')
  const interaction = workflow.match(/^  browser-interaction:\n([\s\S]*?)(?=^  [a-z-]+:\n)/m)![1]
  assert.match(interaction, /        - chromium\n        - firefox\n        - webkit\n/)
  assert.match(interaction, /        lane:\n        - source-0\n        - source-1\n        - source-2\n        - installed-references\n        - installed-sessions\n        - installed-inputs\n        - installed-apps\n/)
  assert.match(interaction, /BIJUX_TEST_INTERACTION: \$\{\{ matrix.lane \}\}/)
  assert.match(interaction, /Browser interaction \/ \$\{\{ matrix.engine \}\} \/ \$\{\{ matrix.lane \}\}/)
  assert.match(interaction, /name: browser-interaction-\$\{\{ matrix.engine \}\}-\$\{\{ matrix.lane \}\}/)
  assert.match(interaction, /timeout-minutes: 5/)
  assert.match(interaction, /fail-fast: false/)
  assert.doesNotMatch(interaction, /BIJUX_TEST_SHARD|continue-on-error:/)
  assert.match(workflow, /  browsers:\n[\s\S]*?    - browser-interaction\n/)
})
