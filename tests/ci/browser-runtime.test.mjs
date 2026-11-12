import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile, mkdir, mkdtemp, rm} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
import {assertBrowserRuntime, executablePaths, runtimeImage, lockedBrowserDefinitions} from '../../scripts/ci/browser-runtime.mjs'

const lock = JSON.parse(await readFile(new URL('../../package-lock.json', import.meta.url), 'utf8'))
const input = () => ({lock: structuredClone(lock), driverVersion: '1.64.1', coreVersion: '1.64.1',
  image: {driverVersion: '1.64.1', dockerImageName: 'mcr.microsoft.com/playwright:v1.64.1-noble'},
  definitions: {browsers: [
    ['chromium', '1248'], ['chromium-headless-shell', '1248'], ['firefox', '1555'], ['webkit', '2370'], ['ffmpeg', '1013'],
  ].map(([name, revision]) => ({name, revision}))},
  paths: {...executablePaths}, browsersPath: '/ms-playwright', platform: 'linux', arch: 'x64', nodeVersion: '24.3.0', uid: 1001, homeUID: 1001})

test('browser runtime accepts only the locked image and exact executable bindings', () => {
  assert.doesNotThrow(() => assertBrowserRuntime(input()))
  for (const change of [
    row => {row.driverVersion = '1.64.0'}, row => {row.coreVersion = '1.64.0'},
    row => {row.image.driverVersion = '1.64.0'}, row => {row.image.dockerImageName = 'mcr.microsoft.com/playwright:v1.64.1-jammy'},
    row => {row.lock.packages['node_modules/playwright'].version = '1.65.0'},
    row => {row.lock.packages['node_modules/playwright-core'].version = '1.65.0'},
    row => {row.lock.packages[''].devDependencies.playwright = '^1.64.1'},
    row => {row.definitions.browsers[0].revision = '1249'}, row => {row.definitions.browsers.pop()},
    row => {row.paths.chromium = '/packages/chrome'}, row => {delete row.paths.webkit},
    row => {row.browsersPath = '/artifacts/tools/browsers'}, row => {row.platform = 'darwin'},
    row => {row.arch = 'arm64'}, row => {row.nodeVersion = '26.0.0'},
    row => {row.uid = 0}, row => {row.homeUID = 0},
  ]) {const row = input(); change(row); assert.throws(() => assertBrowserRuntime(row))}
})

test('installed client browser definitions agree with the provisioned image revisions', async () => {
  const row = input()
  row.definitions = await lockedBrowserDefinitions()
  assert.doesNotThrow(() => assertBrowserRuntime(row))
})

for (const workflow of ['validation', 'package-candidate']) {
  test(workflow + ' consumes one pinned image without changing browser admission', async () => {
    const source = await readFile(new URL('../../.github/workflows/' + workflow + '.yml', import.meta.url), 'utf8')
    const jobs = new Map([...source.matchAll(/^  ([a-z][a-z-]*):\n([\s\S]*?)(?=^  [a-z][a-z-]*:\n|(?![\s\S]))/gm)]
      .map(match => [match[1], match[2]]))
    assert.equal([...source.matchAll(/    container:\n/g)].length, 2)
    for (const name of ['browser-corpus', 'browser-interaction']) {
      const job = jobs.get(name)
      assert.ok(job.includes('      image: ' + runtimeImage + '\n'))
      assert.match(job, /      options: --init --shm-size=1g --user pwuser\n/)
      assert.match(job, /    defaults:\n      run:\n        shell: bash\n/)
      assert.match(job, /      PLAYWRIGHT_BROWSERS_PATH: \/ms-playwright\n/)
      assert.match(job, /    timeout-minutes: 5\n/)
      assert.match(job, /        node-version: 24\.3\.0\n/)
      assert.match(job, /        - chromium\n        - firefox\n        - webkit\n/)
      assert.match(job, /      fail-fast: false\n/)
      const commands = ['git config --global --add safe.directory "$PWD"', 'node scripts/ci/runtime-bundles.mjs restore assets', 'node tests/package/consumers.mjs --verify',
        'node scripts/ci/browser-runtime.mjs', 'node scripts/ci/browser-checks.mjs ' + (name === 'browser-corpus' ? 'corpus' : 'interaction')]
      const positions = commands.map(command => job.indexOf(command))
      assert.ok(positions.every(index => index >= 0))
      assert.deepEqual(positions, [...positions].sort((a, b) => a - b))
      assert.doesNotMatch(job, /apt-get|apt\/|playwright install|actions\/cache@|privileged|SYS_ADMIN|--network|--ipc=host|continue-on-error/)
    }
    const corpus = jobs.get('browser-corpus'), interaction = jobs.get('browser-interaction')
    const shards = 8
    const shardRows = corpus.match(/        shard:\n((?:        - \d+\n)+)/)[1]
    assert.deepEqual([...shardRows.matchAll(/        - (\d+)/g)].map(row => Number(row[1])),
      Array.from({length: shards}, (_, index) => index))
    assert.ok(corpus.includes('BIJUX_TEST_SHARD: ${{ matrix.shard }}/' + shards))
    assert.match(interaction, /        distribution:\n        - source\n        - installed\n/)
    assert.match(interaction, /BIJUX_TEST_INTERACTION: \$\{\{ matrix.distribution \}\}/)
    assert.doesNotMatch(interaction, /BIJUX_TEST_SHARD/)
    const aggregate = jobs.get(workflow === 'validation' ? 'browsers' : 'archives')
    for (const dependency of ['browser-corpus', 'browser-interaction']) assert.ok(aggregate.includes('    - ' + dependency + '\n'))
    assert.match(aggregate, /node tests\/ci\/verify-coverage.mjs browser/)
  })
}

test('container Git trust permits only the checked-out repository', async () => {
  const work = new URL('../../artifacts/work/', import.meta.url)
  await mkdir(work, {recursive: true})
  const directory = await mkdtemp(new URL('checkout-trust-', work))
  const first = resolve(directory, 'selected'), second = resolve(directory, 'other')
  const env = {...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: resolve(directory, 'gitconfig'),
    GIT_TEST_ASSUME_DIFFERENT_OWNER: '1'}
  const run = (cwd, ...args) => spawnSync('git', args, {cwd, env, encoding: 'utf8'})
  try {
    for (const path of [first, second]) {
      await mkdir(path)
      assert.equal(run(path, 'init', '--quiet').status, 0)
      const refused = run(path, 'rev-parse', '--show-toplevel')
      assert.notEqual(refused.status, 0)
      assert.match(refused.stderr, /dubious ownership/)
    }
    assert.equal(run(first, 'config', '--global', '--add', 'safe.directory', first).status, 0)
    const accepted = run(first, 'rev-parse', '--show-toplevel')
    assert.equal(accepted.status, 0, accepted.stderr)
    assert.equal(accepted.stdout.trim(), first)
    assert.notEqual(run(second, 'rev-parse', '--show-toplevel').status, 0)
  } finally {await rm(directory, {recursive: true, force: true})}
})
