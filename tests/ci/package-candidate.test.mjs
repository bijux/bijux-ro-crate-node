import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'

const workflow = await readFile(new URL('../../.github/workflows/package-candidate.yml', import.meta.url), 'utf8')
const jobs = new Map([...workflow.matchAll(/^  ([a-z][a-z-]*):\n([\s\S]*?)(?=^  [a-z][a-z-]*:\n|(?![\s\S]))/gm)]
  .map(match => [match[1], match[2]]))
const needs = job => [...(job.match(/^    needs:\n((?:    - [a-z-]+\n)+)/m)?.[1] ?? '').matchAll(/    - ([a-z-]+)/g)]
  .map(match => match[1])

test('candidate upload requires every parallel group and exact browser coverage', () => {
  assert.deepEqual([...jobs.keys()], ['packages', 'assets', 'browser-corpus', 'browser-interaction', 'installed', 'archives'])
  for (const [name, job] of jobs) {
    assert.match(job, /    timeout-minutes: 5\n/, name)
    assert.doesNotMatch(job, /continue-on-error:/, name)
  }
  assert.deepEqual(needs(jobs.get('archives')), ['packages', 'assets', 'browser-corpus', 'browser-interaction', 'installed'])
  const final = jobs.get('archives')
  assert.match(final, /if: \$\{\{ always\(\) \}\}/)
  assert.match(final, /BIJUX_REQUIRED_JOBS: \$\{\{ toJSON\(needs\) \}\}/)
  const checks = ['node scripts/ci/require-jobs.mjs', 'node scripts/ci/runtime-bundles.mjs restore assets',
    'node tests/ci/verify-coverage.mjs browser artifacts/reports/qualification/corpus 4',
    'node tests/package/consumers.mjs --verify', 'name: unpublished-package-candidate-${{ github.sha }}']
  const positions = checks.map(check => final.indexOf(check))
  assert.ok(positions.every(index => index >= 0))
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'Upload must follow admission, coverage and archive proof')
  assert.doesNotMatch(final, /npm (?:ci|test|pack|run build|run test:pack)/, 'Final archives must be the qualified producer bytes')
})

test('candidate qualifies both pinned Node lines and all native browser distributions', () => {
  for (const name of ['packages', 'installed']) {
    assert.match(jobs.get(name), /        - 22\.23\.4\n        - 24\.3\.0\n/)
    assert.match(jobs.get(name), /fail-fast: false/)
  }
  for (const command of ['npm test', 'npm run check:workspace', 'npm run check:types'])
    assert.ok(jobs.get('packages').includes(command), command)
  assert.match(jobs.get('installed'), /node tests\/package\/consumers\.mjs --node/)
  for (const name of ['browser-corpus', 'browser-interaction']) {
    const job = jobs.get(name)
    assert.deepEqual(needs(job), ['assets'])
    assert.match(job, /        - chromium\n        - firefox\n        - webkit\n/)
    assert.match(job, /restore assets "\$\{\{ needs\.assets\.outputs\.sha256 \}\}"/)
    assert.match(job, /node tests\/package\/consumers\.mjs --verify/)
    assert.match(job, new RegExp('node scripts/ci/browser-checks.mjs ' + (name === 'browser-corpus' ? 'corpus' : 'interaction')))
  }
  assert.match(jobs.get('browser-corpus'), /BIJUX_TEST_SHARD: \$\{\{ matrix\.shard \}\}\/4/)
  assert.match(jobs.get('browser-corpus'), /        - 0\n        - 1\n        - 2\n        - 3\n/)
  assert.doesNotMatch(jobs.get('browser-interaction'), /BIJUX_TEST_SHARD|matrix\.shard/)
  const interaction = jobs.get('browser-interaction')
  assert.match(interaction, /        distribution:\n        - source\n        - installed\n/)
  assert.match(interaction, /BIJUX_TEST_INTERACTION: \$\{\{ matrix.distribution \}\}/)
  assert.match(interaction, /name: candidate-browser-interaction-\$\{\{ matrix.engine \}\}-\$\{\{ matrix.distribution \}\}/)
  assert.match(interaction, /name: Browser interaction \/ \$\{\{ matrix.engine \}\} \/ \$\{\{ matrix.distribution \}\}/)
})

test('candidate preserves the manual unpublished artifact admission contract', () => {
  assert.match(workflow, /^name: Package candidate\non:\n  workflow_dispatch:\npermissions:\n  contents: read\n/)
  assert.doesNotMatch(workflow, /id-token:|contents: write|npm publish|release-npm|git tag|workflow_call:/)
  assert.equal([...workflow.matchAll(/name: unpublished-package-candidate-/g)].length, 1)
  const preparation = jobs.get('assets')
  assert.match(preparation, /npm run build\n        node scripts\/release\/pack\.mjs\n        node tests\/package\/consumers\.mjs --prepare/)
  assert.match(preparation, /node scripts\/ci\/runtime-bundles\.mjs pack assets/)
  const final = jobs.get('archives')
  for (const receipt of ['candidate-commit.txt', 'candidate-tree.txt', 'package-lock.sha256']) assert.ok(final.includes(receipt))
  assert.match(final, /path: \|-\n          artifacts\/packages\n          artifacts\/reports\n/)
  for (const artifact of ['candidate-packages-*', 'candidate-installed-node-*', 'candidate-browser-interaction-*',
    'candidate-browser-corpus-*', 'candidate-preparation']) assert.ok(final.includes(artifact), artifact)
})
