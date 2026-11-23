import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {copyFile, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {dirname, resolve} from 'node:path'
import {test, type TestContext} from 'node:test'
import {fileURLToPath} from 'node:url'
import {entries, runtimeEntryPaths} from '../../../scripts/runtime-entries.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))

async function fixture(t: TestContext): Promise<string> {
  const artifacts = resolve(root, 'artifacts/work')
  await mkdir(artifacts, {recursive: true})
  const directory = await mkdtemp(resolve(artifacts, 'parity-launcher-'))
  t.after(() => rm(directory, {recursive: true, force: true}))
  await mkdir(resolve(directory, 'scripts'), {recursive: true})
  await mkdir(resolve(directory, 'tests/parity'), {recursive: true})
  await copyFile(resolve(root, 'scripts/parity.mjs'), resolve(directory, 'scripts/parity.mjs'))
  await writeFile(resolve(directory, 'tests/parity/run.mjs'), `
console.log(JSON.stringify({argv: process.argv.slice(2), execArgv: process.execArgv, hasBinding: Object.hasOwn(process.env, 'BIJUX_VALIDATOR_MODULE'), binding: process.env.BIJUX_VALIDATOR_MODULE ?? null, nodeOptions: process.env.NODE_OPTIONS ?? null}))
if (process.env.BIJUX_PARITY_TEST_SIGNAL) process.kill(process.pid, process.env.BIJUX_PARITY_TEST_SIGNAL)
process.exit(Number(process.env.BIJUX_PARITY_TEST_EXIT ?? 0))
`)
  return directory
}

function launch(directory: string, variables: NodeJS.ProcessEnv = {}) {
  const env = {...process.env}
  delete env.NODE_OPTIONS
  delete env.BIJUX_VALIDATOR_MODULE
  Object.assign(env, variables)
  return spawnSync(process.execPath, [resolve(directory, 'scripts/parity.mjs'), '--snapshot', 'extra'], {cwd: root, env, encoding: 'utf8'})
}

test('parity launcher selects the loader from presence of the installed module binding', async t => {
  const directory = await fixture(t)
  for (const binding of [undefined, '', 'file:///installed/index.js']) {
    const result = launch(directory, binding === undefined ? {} : {BIJUX_VALIDATOR_MODULE: binding})
    assert.equal(result.status, 0, result.stderr)
    const receipt = JSON.parse(result.stdout) as {argv: string[], execArgv: string[], hasBinding: boolean, binding: string | null, nodeOptions: string | null}
    assert.deepEqual(receipt.argv, ['--snapshot', 'extra'])
    assert.deepEqual(receipt.execArgv, binding === undefined ? ['--import', 'tsx'] : [])
    assert.equal(receipt.hasBinding, binding !== undefined)
    assert.equal(receipt.binding, binding ?? null)
    assert.equal(receipt.nodeOptions, null)
  }
})

test('parity launcher forwards child exit status and termination signal', async t => {
  const directory = await fixture(t)
  const exited = launch(directory, {BIJUX_VALIDATOR_MODULE: '', BIJUX_PARITY_TEST_EXIT: '17'})
  assert.equal(exited.status, 17, exited.stderr)
  const signaled = launch(directory, {BIJUX_VALIDATOR_MODULE: '', BIJUX_PARITY_TEST_SIGNAL: 'SIGTERM'})
  assert.equal(signaled.signal, 'SIGTERM', signaled.stderr)
})

test('runtime entry generation rejects stale output and reproduces the checked-in launcher', async t => {
  const directory = await fixture(t)
  await copyFile(resolve(root, '.gitattributes'), resolve(directory, '.gitattributes'))
  await copyFile(resolve(root, 'scripts/generate-runtime-entries.mts'), resolve(directory, 'scripts/generate-runtime-entries.mts'))
  for (const entry of entries) for (const path of Object.values(runtimeEntryPaths(entry))) {
    await mkdir(dirname(resolve(directory, path)), {recursive: true})
    await copyFile(resolve(root, path), resolve(directory, path))
  }
  const browserOutput = resolve(directory, 'tests/browser/upstream-defects.mjs')
  await writeFile(browserOutput, 'stale\n')
  const output = resolve(directory, 'scripts/parity.mjs')
  const generator = resolve(directory, 'scripts/generate-runtime-entries.mts')
  await writeFile(output, 'stale\n')
  const admission = resolve(directory, 'scripts/ci/require-jobs.mjs')
  await writeFile(admission, 'stale\n')
  const run = (mode: string, selection?: string) => spawnSync(process.execPath, ['--import', 'tsx', generator, mode, ...(selection === undefined ? [] : [selection])], {cwd: root, encoding: 'utf8'})
  assert.notEqual(run('--check').status, 0)
  const admissionWrite = run('--write', 'admission')
  assert.equal(admissionWrite.status, 0, admissionWrite.stderr)
  assert.equal(await readFile(admission, 'utf8'), await readFile(resolve(root, 'scripts/ci/require-jobs.mjs'), 'utf8'))
  assert.equal(await readFile(output, 'utf8'), 'stale\n')
  assert.notEqual(run('--check').status, 0)
  const generated = run('--write')
  assert.equal(generated.status, 0, generated.stderr)
  assert.equal(await readFile(output, 'utf8'), await readFile(resolve(root, 'scripts/parity.mjs'), 'utf8'))
  assert.equal(await readFile(resolve(directory, 'scripts/reference/capture-profile-literal-targets.mjs'), 'utf8'),
    await readFile(resolve(root, 'scripts/reference/capture-profile-literal-targets.mjs'), 'utf8'))
  assert.equal(await readFile(browserOutput, 'utf8'), await readFile(resolve(root, 'tests/browser/upstream-defects.mjs'), 'utf8'))
  assert.match(await readFile(browserOutput, 'utf8'), /^\/\/ Generated from tests\/browser\/upstream-defects\.mts/)
  const checked = run('--check')
  assert.equal(checked.status, 0, checked.stderr)
  await writeFile(browserOutput, 'stale\n')
  assert.notEqual(run('--check').status, 0, 'A stale browser entry must fail generation verification')
  const restored = run('--write')
  assert.equal(restored.status, 0, restored.stderr)
  const rechecked = run('--check')
  assert.equal(rechecked.status, 0, rechecked.stderr)
})
