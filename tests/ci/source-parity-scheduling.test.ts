import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'

const workflow = await readFile(new URL('../../.github/workflows/validation.yml', import.meta.url), 'utf8')
const jobs = new Map([...workflow.matchAll(/^  ([a-z][a-z0-9-]*):\n([\s\S]*?)(?=^  [a-z][a-z0-9-]*:\n|(?![\s\S]))/gm)]
  .map(match => [match[1], match[2]]))
const needs = (job: string) => [...(job.match(/^    needs:\n((?:    - [a-z0-9-]+\n)+)/m)?.[1] ?? '').matchAll(/    - ([a-z0-9-]+)/g)]
  .map(match => match[1])
const nodes = /        - 22\.23\.4\n        - 24\.3\.0\n/
const commands = (job: string) => [...job.matchAll(/^    - run: (.+)$/gm)].map(match => match[1]).filter(command => !command.startsWith('|'))
const dependencyPolicy = /github\.event\.pull_request\.user\.login != 'dependabot\[bot\]'.*github\.event\.pull_request\.head\.ref != 'automation\/dependency-lock-refresh'/

test('package tests and source parity run independently on both pinned Node lines', async () => {
  const tests = jobs.get('package-tests')!, types = jobs.get('package-types')!, parity = jobs.get('source-parity')!
  assert.deepEqual(needs(tests), [])
  assert.deepEqual(needs(types), [])
  assert.deepEqual(needs(parity), ['assets'])
  for (const job of [tests, types, parity]) {
    assert.match(job, nodes)
    assert.match(job, /fail-fast: false/)
    assert.match(job, job === tests ? /timeout-minutes: 8/ : /timeout-minutes: 5/)
    assert.match(job, dependencyPolicy)
    assert.doesNotMatch(job, /continue-on-error:/)
    assert.match(job, /node-version: \$\{\{ matrix.node \}\}/)
  }
  const rootManifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))
  assert.equal(rootManifest.scripts.pretest, 'npm run build')
  assert.deepEqual(commands(tests), ['npm ci', 'npm test', 'npm run check:workspace'])
  assert.deepEqual(commands(types), ['npm ci', 'npm run build', 'npm run check:types'])
  assert.deepEqual(commands(parity), [
    'node scripts/ci/runtime-bundles.mjs restore assets "${{ needs.assets.outputs.sha256 }}"',
    'node tests/parity/snapshot-partitions.mjs', 'node tests/package/source.mjs --upstream', 'node --import tsx tests/package/native-inputs.mjs',
    'node --import tsx tests/reference/literal-grammar/run.mjs',
    'node --import tsx tests/reference/jsonld-processing/run.mjs',
    'node --import tsx --test tests/reference/jsonld-processing/checks.test.ts tests/reference/jsonld-processing/portable.test.ts',
  ])
  assert.match(parity, /name: assets-runtime\n        path: artifacts\/ci/)
  assert.match(parity, /BIJUX_TEST_NODE: \$\{\{ matrix.node \}\}/)
  assert.doesNotMatch(parity, /npm ci|npm run build|npm test\n/)
})

test('canonical package contexts require both complete matrices through fail-closed admission', () => {
  const summary = jobs.get('packages')!
  assert.deepEqual(needs(summary), ['package-tests', 'package-types', 'source-parity'])
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
  const run = (jobs: unknown) => spawnSync(process.execPath, [runner.pathname], {encoding: 'utf8',
    env: {...process.env, BIJUX_REQUIRED_JOBS: JSON.stringify(jobs)}})
  const good: Record<string, {result: string | undefined}> = {'package-tests': {result: 'success'}, 'package-types': {result: 'success'}, 'source-parity': {result: 'success'}}
  assert.equal(run(good).status, 0)
  for (const name of Object.keys(good)) for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
    const invalid = structuredClone(good)
    invalid[name] = {result}
    assert.notEqual(run(invalid).status, 0, name + ': ' + result)
  }
  assert.notEqual(run({}).status, 0)
})
