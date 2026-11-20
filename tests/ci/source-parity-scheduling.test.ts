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
  const tests = jobs.get('package-tests')!, roots = jobs.get('root-tests')!, types = jobs.get('package-types')!, parity = jobs.get('source-parity')!
  assert.deepEqual(needs(tests), [])
  assert.deepEqual(needs(roots), ['assets'])
  assert.deepEqual(needs(types), [])
  assert.deepEqual(needs(parity), ['assets'])
  for (const job of [tests, roots, types, parity]) {
    assert.match(job, nodes)
    assert.match(job, /fail-fast: false/)
    assert.match(job, /timeout-minutes: 5/)
    assert.match(job, dependencyPolicy)
    assert.doesNotMatch(job, /continue-on-error:/)
    assert.match(job, /node-version: \$\{\{ matrix.node \}\}/)
  }
  const rootManifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))
  assert.equal(rootManifest.scripts.pretest, 'npm run build')
  assert.deepEqual(commands(tests), ['npm ci', 'npm run build', 'npm test --workspace @bijux/ro-crate-validator -- --test-shard=${{ matrix.shard }}/3'])
  assert.match(tests, /if: \$\{\{ matrix.shard == 1 \}\}\n      run: npm test --workspace @bijux\/ro-crate-core/)
  assert.match(tests, /if: \$\{\{ matrix.shard == 1 \}\}\n      run: npm run check:workspace/)
  assert.match(tests, /run: npm run check:test-selection/)
  assert.match(tests, /shard: \[1, 2, 3\]/)
  assert.match(roots, /lane: \[ordinary-1, ordinary-2, workspace-build, installed-workspaces, compiler-contract\]/)
  assert.match(roots, /startsWith\(matrix.lane, 'ordinary-'\)[\s\S]*?run: npm run build/)
  assert.deepEqual(commands(roots), ['node scripts/ci/runtime-bundles.mjs restore assets "${{ needs.assets.outputs.sha256 }}"', 'node scripts/ci/root-test-shards.mjs ${{ matrix.lane }}'])
  assert.deepEqual(commands(types), ['npm ci', 'npm run build', 'npm run check:types'])
  assert.deepEqual(commands(parity), [
    'node scripts/ci/runtime-bundles.mjs restore assets "${{ needs.assets.outputs.sha256 }}"',
    'node tests/parity/snapshot-partitions.mjs', 'node tests/package/source.mjs --upstream', 'node --import tsx tests/package/native-inputs.mjs',
    'node --import tsx tests/reference/literal-grammar/run.mjs',
    'node --import tsx tests/reference/jsonld-processing/run.mjs',
    'node scripts/ci/reference-checks.mjs source-contracts',
  ])
  assert.match(parity, /name: assets-runtime\n        path: artifacts\/ci/)
  assert.match(parity, /BIJUX_TEST_NODE: \$\{\{ matrix.node \}\}/)
  assert.doesNotMatch(parity, /npm ci|npm run build|npm test\n/)
})

test('canonical package contexts require both complete matrices through fail-closed admission', () => {
  const summary = jobs.get('packages')!
  assert.deepEqual(needs(summary), ['package-tests', 'root-tests', 'package-types', 'source-parity'])
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
  const good: Record<string, {result: string | undefined}> = {'package-tests': {result: 'success'}, 'root-tests': {result: 'success'}, 'package-types': {result: 'success'}, 'source-parity': {result: 'success'}}
  assert.equal(run(good).status, 0)
  for (const name of Object.keys(good)) for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
    const invalid = structuredClone(good)
    invalid[name] = {result}
    assert.notEqual(run(invalid).status, 0, name + ': ' + result)
  }
  assert.notEqual(run({}).status, 0)
})

test('Node 26 compatibility qualifies prepared source and installed packages independently', () => {
  const job = jobs.get('node-compatibility')!
  assert.ok(job)
  const packageName = jobs.get('package-tests')!.match(/^    name: (.+)$/m)![1]
  const prefix = packageName.slice(0, packageName.indexOf('Package tests /'))
  assert.ok(prefix, 'Package tests must carry the dependency proposal name prefix')
  assert.match(job, dependencyPolicy)
  assert.equal(job.match(/^    name: (.+)$/m)?.[1], prefix + 'Node 26 compatibility / ${{ matrix.scope }}')
  assert.deepEqual(needs(job), ['assets'])
  assert.match(job, /timeout-minutes: 5/)
  assert.match(job, /scope: \[source, installed\]/)
  assert.match(job, /BIJUX_TEST_NODE: 26\.13\.1/)
  assert.match(job, /node-version: 26\.13\.1/)
  assert.match(job, /name: assets-runtime\n        path: artifacts\/ci/)
  assert.deepEqual(commands(job), [
    'node scripts/ci/runtime-bundles.mjs restore assets "${{ needs.assets.outputs.sha256 }}"',
    'node --throw-deprecation --import tsx -e "process.stdout.write(process.versions.node)"',
    'node tests/package/source.mjs', 'node tests/package/consumers.mjs --node',
  ])
  assert.match(job, /run: node tests\/package\/source.mjs\n      if: \$\{\{ matrix.scope == 'source' \}\}/)
  assert.match(job, /run: node tests\/package\/consumers.mjs --node\n      if: \$\{\{ matrix.scope == 'installed' \}\}/)
  assert.match(job, /name: node-compatibility-26-\$\{\{ matrix.scope \}\}/)
  assert.doesNotMatch(job, /continue-on-error:|candidate-source-node-/)
  for (const required of ['packages', 'reference', 'browsers']) assert.ok(!needs(jobs.get(required)!).includes('node-compatibility'))
})
