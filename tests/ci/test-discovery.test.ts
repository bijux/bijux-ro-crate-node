import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'
import {discoverTests} from '../../scripts/test-discovery.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const runner = fileURLToPath(new URL('../../scripts/test-discovery.mjs', import.meta.url))

test('package discovery runs mixed JavaScript and TypeScript files and preserves selectors', async t => {
  if (process.env.BIJUX_TEST_NODE) assert.equal(process.versions.node, process.env.BIJUX_TEST_NODE)
  const owner = resolve(root, 'artifacts/work')
  await mkdir(owner, {recursive: true})
  const directory = await mkdtemp(resolve(owner, 'test discovery '))
  t.after(() => rm(directory, {recursive: true, force: true}))
  await writeFile(resolve(directory, 'package.json'), '{"type":"module"}\n')
  for (const name of ['tests/alpha.test.ts', 'tests/deep/beta.test.mjs', 'tests/deep/other-test.js', 'test/helper.cjs', 'tests/legacy.test.cts', 'tests/test-runner.mts']) {
    const path = resolve(directory, name)
    await mkdir(resolve(path, '..'), {recursive: true})
    const source = (name.endsWith('.cjs') || name.endsWith('.cts')) ? `const test = require('node:test'); test('${name}', () => console.log('executed:${name}'))\n` : `import test from 'node:test'; test('${name}', () => console.log('executed:${name}'))\n`
    await writeFile(path, source)
  }
  await mkdir(resolve(directory, 'node_modules/ignored'), {recursive: true})
  await writeFile(resolve(directory, 'node_modules/ignored/ignored.test.mjs'), 'throw new Error("ignored")\n')
  await mkdir(resolve(directory, '.hidden'), {recursive: true})
  await writeFile(resolve(directory, '.hidden/ignored.test.mjs'), 'throw new Error("ignored")\n')
  await writeFile(resolve(directory, 'tests/helper.mjs'), 'throw new Error("not a test")\n')
  await writeFile(resolve(directory, 'tests/loader.test.mjs'), `
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import test from 'node:test'
test('loader isolation', () => {
  const child = spawnSync(process.execPath, ['-p', 'JSON.stringify({args:process.execArgv,options:process.env.NODE_OPTIONS??null})'], {encoding: 'utf8'})
  assert.equal(child.status, 0, child.stderr)
  const receipt = JSON.parse(child.stdout)
  assert.equal(receipt.options, null)
  assert.equal(receipt.args.includes('--import'), false)
})
` )
  await symlink('deep/beta.test.mjs', resolve(directory, 'tests/link.test.mjs'))
  assert.deepEqual(await discoverTests(directory), ['test/helper.cjs', 'tests/alpha.test.ts', 'tests/deep/beta.test.mjs', 'tests/deep/other-test.js', 'tests/legacy.test.cts', 'tests/link.test.mjs', 'tests/loader.test.mjs', 'tests/test-runner.mts'])
  const env = {...process.env}
  delete env.NODE_TEST_CONTEXT
  delete env.NODE_OPTIONS
  const run = (...args: string[]) => spawnSync(process.execPath, [runner, ...args], {cwd: directory, env, encoding: 'utf8'})
  const all = run()
  assert.equal(all.status, 0, all.stderr + all.stdout)
  for (const name of ['test/helper.cjs', 'tests/alpha.test.ts', 'tests/deep/beta.test.mjs', 'tests/deep/other-test.js', 'tests/legacy.test.cts', 'tests/test-runner.mts']) assert.ok(all.stdout.includes(name), name + "\n" + all.stdout + "\n" + all.stderr)
  const selected = run('--test-reporter=tap', '--test-name-pattern', 'alpha')
  assert.equal(selected.status, 0, selected.stderr + selected.stdout)
  assert.match(selected.stdout, /alpha\.test\.ts/)
  assert.match(selected.stdout, /executed:tests\/alpha\.test\.ts/)
  assert.doesNotMatch(selected.stdout, /executed:tests\/deep\/beta\.test\.mjs/)
  const only = run('tests/deep/beta.test.mjs')
  assert.equal(only.status, 0, only.stderr + only.stdout)
  assert.match(only.stdout, /beta\.test\.mjs/)
  assert.doesNotMatch(only.stdout, /alpha\.test\.ts/)
  await writeFile(resolve(directory, 'tests/failure.test.mjs'), "import test from 'node:test'; test('intentional failure', () => {throw new Error('expected failure')})\n")
  const failure = run('tests/failure.test.mjs')
  assert.notEqual(failure.status, 0)
  assert.match(failure.stdout + failure.stderr, /expected failure/)
  await symlink('missing.mjs', resolve(directory, 'tests/dangling.test.mjs'))
  assert.ok((await discoverTests(directory)).includes('tests/dangling.test.mjs'))
  const dangling = run('tests/dangling.test.mjs')
  assert.notEqual(dangling.status, 0)
})

test('package discovery fails if no test files exist', async t => {
  const owner = resolve(root, 'artifacts/work')
  await mkdir(owner, {recursive: true})
  const directory = await mkdtemp(resolve(owner, 'empty-tests-'))
  t.after(() => rm(directory, {recursive: true, force: true}))
  const result = spawnSync(process.execPath, [runner], {cwd: directory, encoding: 'utf8'})
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /No package test files found/)
})

test('validation exercises discovery on the minimum supported Node version', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/validation.yml', import.meta.url), 'utf8')
  assert.match(workflow, /node-version: 22\.0\.0/)
  assert.match(workflow, /BIJUX_TEST_NODE=22\.0\.0 node --import tsx --test tests\/ci\/test-discovery\.test\.ts/)
})
