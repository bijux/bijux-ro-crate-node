import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {packagesInOrder} from '../../scripts/workspaces.mjs'

const workflow = await readFile(new URL('../../.github/workflows/package-candidate.yml', import.meta.url), 'utf8')
const jobs = new Map([...workflow.matchAll(/^  ([a-z][a-z-]*):\n([\s\S]*?)(?=^  [a-z][a-z-]*:\n|(?![\s\S]))/gm)]
  .map(match => [match[1], match[2]]))
const needs = (job: string) => [...(job.match(/^    needs:\n((?:    - [a-z-]+\n)+)/m)?.[1] ?? '').matchAll(/    - ([a-z-]+)/g)]
  .map(match => match[1])

test('candidate upload requires every parallel group and exact browser coverage', () => {
  assert.deepEqual([...jobs.keys()], ['packages', 'root-tests', 'source-reports', 'package-types', 'assets', 'source-parity', 'browser-corpus', 'browser-interaction', 'installed', 'authoring-web', 'local-registration', 'local-account', 'archives'])
  for (const [name, job] of jobs) {
    assert.match(job, new RegExp('    timeout-minutes: ' + (name === 'browser-corpus' ? 8 : 5) + '\n'), name)
    assert.doesNotMatch(job, /continue-on-error:/, name)
  }
  assert.deepEqual(needs(jobs.get('archives')!), ['packages', 'root-tests', 'source-reports', 'package-types', 'source-parity', 'assets', 'browser-corpus', 'browser-interaction', 'installed', 'authoring-web', 'local-account', 'local-registration'])
  assert.match(jobs.get('authoring-web')!, /        - 22\.23\.4\n        - 24\.3\.0\n/)
  const final = jobs.get('archives')!
  assert.match(final, /if: \$\{\{ always\(\) \}\}/)
  assert.match(final, /BIJUX_REQUIRED_JOBS: \$\{\{ toJSON\(needs\) \}\}/)
  const checks = ['node scripts/ci/require-jobs.mjs', 'node scripts/ci/runtime-bundles.mjs restore assets',
    'node tests/ci/verify-coverage.mjs browser artifacts/reports/qualification/corpus 8',
    'node tests/package/source.mjs --verify', 'node tests/package/consumers.mjs --verify', 'name: unpublished-package-candidate-${{ github.sha }}']
  const positions = checks.map(check => final.indexOf(check))
  assert.ok(positions.every(index => index >= 0))
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'Upload must follow admission, coverage and archive proof')
  assert.doesNotMatch(final, /npm (?:ci|test|pack|run build|run test:pack)/, 'Final archives must be the qualified producer bytes')
})

test('candidate qualifies both pinned Node lines and all native browser distributions', async () => {
  for (const name of ['packages', 'root-tests', 'source-reports', 'package-types', 'source-parity', 'installed']) {
    assert.match(jobs.get(name)!, /        - 22\.23\.4\n        - 24\.3\.0\n/)
    assert.match(jobs.get(name)!, /fail-fast: false/)
  }
  const packages = jobs.get('packages')!
  assert.match(packages, /shard: \[1, 2, 3\]/)
  assert.match(packages, /if: \$\{\{ matrix.shard == 1 \}\}\n      run: npm test --workspace @bijux\/ro-crate-core/)
  assert.match(packages, /if: \$\{\{ matrix.shard == 1 \}\}\n      run: npm test --workspace @bijux\/ro-crate-creator/)
  assert.match(packages, /npm test --workspace @bijux\/ro-crate-validator -- --test-shard=\$\{\{ matrix.shard \}\}\/3/)
  assert.deepEqual((await packagesInOrder()).filter(item => item.manifest.scripts?.test).map(item => item.manifest.name), ['@bijux/ro-crate-core', '@bijux/ro-crate-creator', '@bijux/ro-crate-validator'])
  const root = jobs.get('root-tests')!
  assert.deepEqual(needs(root), ['assets'])
  assert.match(root, /lane: \[ordinary-1, ordinary-2, workspace-build, installed-workspaces-contracts, installed-workspaces-scenarios, installed-workspaces-assets, compiler-contract\]/)
  assert.match(root, /restore assets \"\$\{\{ needs.assets.outputs.sha256 \}\}\"/)
  assert.match(root, /node scripts\/ci\/root-test-shards.mjs \$\{\{ matrix.lane \}\}/)
  const reports = jobs.get('source-reports')!
  assert.deepEqual(needs(reports), ['assets'])
  assert.match(reports, /restore assets \"\$\{\{ needs.assets.outputs.sha256 \}\}\"/)
  assert.doesNotMatch(reports, /npm ci|npm run build/)
  for (const command of ['npm run check:workspace', 'tests/package/native-inputs.mjs', 'tests/reference/literal-grammar/run.mjs', 'name: candidate-packages-${{ matrix.node }}']) assert.ok(reports.includes(command), command)
  assert.match(jobs.get('package-types')!, /npm ci[\s\S]*npm run build[\s\S]*npm run check:types/)
  assert.match(jobs.get('installed')!, /node tests\/package\/consumers\.mjs --node/)
  for (const name of ['browser-corpus', 'browser-interaction']) {
    const job = jobs.get(name)!
    assert.deepEqual(needs(job), ['assets'])
    assert.match(job, /        - chromium\n        - firefox\n        - webkit\n/)
    assert.match(job, /restore assets "\$\{\{ needs\.assets\.outputs\.sha256 \}\}"/)
    assert.match(job, /node tests\/package\/consumers\.mjs --verify/)
    assert.match(job, new RegExp('node --import tsx scripts/ci/browser-checks.mjs ' + (name === 'browser-corpus' ? 'corpus' : 'interaction')))
  }
  assert.match(jobs.get('browser-corpus')!, /BIJUX_TEST_SHARD: \$\{\{ matrix\.shard \}\}\/8/)
  assert.match(jobs.get('browser-corpus')!, /        - 0\n        - 1\n        - 2\n        - 3\n        - 4\n        - 5\n        - 6\n        - 7\n/)
  assert.doesNotMatch(jobs.get('browser-interaction')!, /BIJUX_TEST_SHARD|matrix\.shard/)
  const interaction = jobs.get('browser-interaction')!
  assert.match(interaction, /        lane:\n        - source-0\n        - source-1\n        - source-2\n        - installed-references\n        - installed-sessions\n        - installed-inputs\n        - installed-apps\n/)
  assert.match(interaction, /BIJUX_TEST_INTERACTION: \$\{\{ matrix.lane \}\}/)
  assert.match(interaction, /name: candidate-browser-interaction-\$\{\{ matrix.engine \}\}-\$\{\{ matrix.lane \}\}/)
  assert.match(interaction, /name: Browser interaction \/ \$\{\{ matrix.engine \}\} \/ \$\{\{ matrix.lane \}\}/)
})

test('candidate preserves the manual unpublished artifact admission contract', () => {
  assert.match(workflow, /^name: Package candidate\non:\n  workflow_dispatch:\npermissions:\n  contents: read\n/)
  assert.doesNotMatch(workflow, /id-token:|contents: write|npm publish|release-npm|git tag|workflow_call:/)
  assert.equal([...workflow.matchAll(/name: unpublished-package-candidate-/g)].length, 1)
  const preparation = jobs.get('assets')!
  assert.match(preparation, /npm run build\n        node scripts\/release\/pack\.mjs\n        node tests\/package\/consumers\.mjs --prepare/)
  assert.match(preparation, /node scripts\/ci\/runtime-bundles\.mjs pack assets/)
  const final = jobs.get('archives')!
  for (const receipt of ['candidate-commit.txt', 'candidate-tree.txt', 'package-lock.sha256']) assert.ok(final.includes(receipt))
  assert.match(final, /path: \|-\n          artifacts\/packages\n          artifacts\/reports\n/)
  for (const artifact of ['candidate-packages-*', 'candidate-installed-node-*', 'candidate-browser-interaction-*',
    'candidate-browser-corpus-*-attempt-*', 'candidate-source-node-*', 'candidate-source-partitions-*', 'candidate-preparation']) assert.ok(final.includes(artifact), artifact)
})

test('candidate source lanes reuse the producer and require exact Node receipts before upload', () => {
  const job = jobs.get('source-parity')!
  assert.deepEqual(needs(job), ['assets'])
  assert.match(job, /BIJUX_TEST_NODE: \$\{\{ matrix.node \}\}/)
  assert.match(job, /restore assets "\$\{\{ needs.assets.outputs.sha256 \}\}"/)
  assert.match(job, /node tests\/package\/consumers\.mjs --verify/)
  assert.match(job, /node tests\/package\/source\.mjs\n/)
  assert.doesNotMatch(job, /npm ci|npm run build|release\/pack|BIJUX_VALIDATOR_MODULE|BIJUX_TEST_SHARD/)
  assert.match(job, /name: candidate-source-node-\$\{\{ matrix.node \}\}/)
  assert.match(job, /path: artifacts\/reports\/source-package-node\*\.json/)
  assert.match(job, /if: \$\{\{ always\(\) \}\}\n      with:\n        name: candidate-source-partitions-/)
  assert.match(job, /path: artifacts\/reports\/snapshot-partitions/)
  assert.match(jobs.get('archives')!, /pattern: candidate-source-node-\*\n        path: artifacts\/reports\/qualification\/source/)
})

test('private authoring workspace is outside public package discovery', async () => {
  const app = JSON.parse(await readFile(new URL('../../apps/web/package.json', import.meta.url), 'utf8')) as {name: string, private: boolean}
  const workspaces = await packagesInOrder()
  assert.equal(app.private, true)
  assert.ok(!workspaces.some(item => item.manifest.name === app.name))
})
