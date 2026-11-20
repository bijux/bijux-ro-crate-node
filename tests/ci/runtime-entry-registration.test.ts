import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFile, cp, mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {test, type TestContext} from 'node:test'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
async function fixture(t: TestContext) {
  const owner = resolve(root, 'artifacts/work')
  await mkdir(owner, {recursive: true})
  const directory = await mkdtemp(resolve(owner, 'runtime-registration-'))
  t.after(() => rm(directory, {recursive: true, force: true}))
  await symlink(resolve(root, 'node_modules'), resolve(directory, 'node_modules'), 'dir')
  await cp(resolve(root, '.gitattributes'), resolve(directory, '.gitattributes'))
  return directory
}
const run = (directory: string, script: string, ...args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {cwd: directory, encoding: 'utf8'})

test('runtime generator rejects unregistered authored entries and orphan generated outputs', async t => {
  const directory = await fixture(t)
  for (const name of ['scripts', 'tests', 'examples']) await cp(resolve(root, name), resolve(directory, name), {recursive: true})
  const generator = resolve(directory, 'scripts/generate-runtime-entries.mts')
  const unknown = resolve(directory, 'scripts/unregistered-entry.mts')
  await writeFile(unknown, 'console.log("entry")\n')
  const authored = run(directory, generator, '--check')
  assert.notEqual(authored.status, 0)
  assert.match(authored.stderr, /Unregistered authored runtime entry.*unregistered-entry\.mts/)
  await rm(unknown)
  for (const name of ['unregistered-entry.ts', 'unregistered-entry.mjs']) {
    const path = resolve(directory, 'scripts', name)
    await writeFile(path, 'console.log("entry")\n')
    const unregistered = run(directory, generator, '--check')
    assert.notEqual(unregistered.status, 0, name)
    assert.match(unregistered.stderr, /Unregistered .*runtime entry/)
    await rm(path)
  }
  const linked = resolve(directory, 'scripts/unregistered-link.mts')
  await symlink(resolve(directory, 'scripts/build.mts'), linked)
  const linkResult = run(directory, generator, '--check')
  assert.notEqual(linkResult.status, 0)
  assert.match(linkResult.stderr, /Unsupported runtime registration symlink/)
  await rm(linked)
  const ordinaryTest = resolve(directory, 'tests/ci/ordinary.test.ts')
  await writeFile(ordinaryTest, 'export const value = 1\n')
  const testSource = run(directory, generator, '--check')
  assert.equal(testSource.status, 0, testSource.stderr)
  await rm(ordinaryTest)
  const orphan = resolve(directory, 'scripts/orphan-entry.mjs')
  await writeFile(orphan, '// Generated from scripts/orphan-entry.mts by npm run generate:runtime; do not edit.\n')
  const generated = run(directory, generator, '--check')
  assert.notEqual(generated.status, 0)
  assert.match(generated.stderr, /Orphan generated runtime entry.*orphan-entry\.mjs/)
})


test('runtime generation detects stale generated attributes without affecting admission-only checks', async t => {
  const directory = await fixture(t)
  for (const name of ['scripts', 'tests', 'examples']) await cp(resolve(root, name), resolve(directory, name), {recursive: true})
  const generator = resolve(directory, 'scripts/generate-runtime-entries.mts')
  const attributes = resolve(directory, '.gitattributes')
  const contents = await readFile(attributes, 'utf8')
  await writeFile(attributes, contents.replace('/scripts/build.mjs linguist-generated=true\n', ''))
  const full = run(directory, generator, '--check')
  assert.notEqual(full.status, 0)
  assert.match(full.stderr, /generated.*attributes|attributes.*generated/i)
  const admission = run(directory, generator, '--check', 'admission')
  assert.equal(admission.status, 0, admission.stderr)
  await rm(attributes)
  const isolatedAdmission = run(directory, generator, '--write', 'admission')
  assert.equal(isolatedAdmission.status, 0, isolatedAdmission.stderr)
})


test('runtime metadata provides normalized authored and generated paths without running the generator', async () => {
  const {entries, runtimeEntryPaths} = await import('../../scripts/runtime-entries.mjs')
  const scenario = entries.find(entry => entry.name === 'package-core-scenario')
  assert.ok(scenario)
  assert.deepEqual(runtimeEntryPaths(scenario), {source: 'tests/package/core.mts', output: 'tests/package/core.mjs'})
  assert.deepEqual(runtimeEntryPaths({name: 'moved', path: '../tests/tooling/contract', command: 'generate:runtime'}), {source: 'tests/tooling/contract.mts', output: 'tests/tooling/contract.mjs'})
})
