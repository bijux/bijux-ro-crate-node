import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'

const workflow = await readFile(new URL('../../.github/workflows/validation.yml', import.meta.url), 'utf8')
const jobs = new Map([...workflow.matchAll(/^  ([a-z][a-z0-9-]*):\n([\s\S]*?)(?=^  [a-z][a-z0-9-]*:\n|(?![\s\S]))/gm)]
  .map(match => [match[1], match[2]]))
const needs = job => [...(job.match(/^    needs:\n((?:    - [a-z0-9-]+\n)+)/m)?.[1] ?? '').matchAll(/    - ([a-z0-9-]+)/g)]
  .map(match => match[1])
const nodes = /        - 22\.23\.4\n        - 24\.3\.0\n/
const commands = job => [...job.matchAll(/^    - run: (.+)$/gm)].map(match => match[1]).filter(command => !command.startsWith('|'))
const dependencyPolicy = /github\.event\.pull_request\.user\.login != 'dependabot\[bot\]'.*github\.event\.pull_request\.head\.ref != 'automation\/dependency-lock-refresh'/

test('package tests and source parity run independently on both pinned Node lines', () => {
  const tests = jobs.get('package-tests'), parity = jobs.get('source-parity')
  assert.deepEqual(needs(tests), [])
  assert.deepEqual(needs(parity), ['assets'])
  for (const job of [tests, parity]) {
    assert.match(job, nodes)
    assert.match(job, /fail-fast: false/)
    assert.match(job, /timeout-minutes: 5/)
    assert.match(job, dependencyPolicy)
    assert.doesNotMatch(job, /continue-on-error:/)
    assert.match(job, /node-version: \$\{\{ matrix.node \}\}/)
  }
  assert.deepEqual(commands(tests), ['npm ci', 'npm run build', 'npm test', 'npm run check:workspace', 'npm run check:types'])
  assert.deepEqual(commands(parity), [
    'node scripts/ci/runtime-bundles.mjs restore assets "${{ needs.assets.outputs.sha256 }}"',
    'node tests/parity/snapshot-partitions.mjs', 'node tests/package/source.mjs --upstream', 'node tests/package/native-inputs.mjs',
    'node tests/reference/literal-grammar/run.mjs',
    'node tests/reference/jsonld-processing/run.mjs',
    'node --test tests/reference/jsonld-processing/checks.test.mjs tests/reference/jsonld-processing/portable.test.mjs',
  ])
  assert.match(parity, /name: assets-runtime\n        path: artifacts\/ci/)
  assert.match(parity, /BIJUX_TEST_NODE: \$\{\{ matrix.node \}\}/)
  assert.doesNotMatch(parity, /npm ci|npm run build|npm test\n/)
})

test('canonical package contexts require both complete matrices through fail-closed admission', () => {
  const summary = jobs.get('packages')
  assert.deepEqual(needs(summary), ['package-tests', 'source-parity'])
  assert.match(summary, nodes)
  assert.match(summary, /if: \$\{\{ .* && \(always\(\)\) \}\}/)
  assert.match(summary, dependencyPolicy)
  assert.match(summary, / }}packages \/ node-\$\{\{ matrix.node \}\}/)
  assert.match(summary, /BIJUX_REQUIRED_JOBS: \$\{\{ toJSON\(needs\) \}\}/)
  assert.match(summary, /timeout-minutes: 5/)
  assert.deepEqual(commands(summary), ['node scripts/ci/require-jobs.mjs'])
  assert.doesNotMatch(summary, /continue-on-error:|result == 'success'/)
})

test('package admission rejects unsuccessful prerequisite matrices', () => {
  const runner = new URL('../../scripts/ci/require-jobs.mjs', import.meta.url)
  const run = jobs => spawnSync(process.execPath, [runner.pathname], {encoding: 'utf8',
    env: {...process.env, BIJUX_REQUIRED_JOBS: JSON.stringify(jobs)}})
  const good = {'package-tests': {result: 'success'}, 'source-parity': {result: 'success'}}
  assert.equal(run(good).status, 0)
  for (const name of Object.keys(good)) for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
    const invalid = structuredClone(good)
    invalid[name] = {result}
    assert.notEqual(run(invalid).status, 0, name + ': ' + result)
  }
  assert.notEqual(run({}).status, 0)
})
