import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {cp, mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises'
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
  const orphan = resolve(directory, 'scripts/orphan-entry.mjs')
  await writeFile(orphan, '// Generated from scripts/orphan-entry.mts by npm run generate:runtime; do not edit.\n')
  const generated = run(directory, generator, '--check')
  assert.notEqual(generated.status, 0)
  assert.match(generated.stderr, /Orphan generated runtime entry.*orphan-entry\.mjs/)
})
