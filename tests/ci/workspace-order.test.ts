import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {copyFile, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {test, type TestContext} from 'node:test'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
interface Package {name: string, dependencies?: Record<string, string>}
async function fixture(t: TestContext, manifests: Record<string, Package>, isPrivate = true) {
  const owner = resolve(root, 'artifacts/work')
  await mkdir(owner, {recursive: true})
  const directory = await mkdtemp(resolve(owner, 'workspace-order-'))
  t.after(() => rm(directory, {recursive: true, force: true}))
  await mkdir(resolve(directory, 'scripts'), {recursive: true})
  await copyFile(resolve(root, 'scripts/workspaces.mjs'), resolve(directory, 'scripts/workspaces.mjs'))
  await writeFile(resolve(directory, 'package.json'), JSON.stringify({private: isPrivate}))
  for (const [name, manifest] of Object.entries(manifests)) {
    const location = resolve(directory, 'packages', name)
    await mkdir(location, {recursive: true})
    await writeFile(resolve(location, 'package.json'), JSON.stringify(manifest))
  }
  return spawnSync(process.execPath, [resolve(directory, 'scripts/workspaces.mjs'), 'check'], {cwd: directory, encoding: 'utf8'})
}

test('workspace check orders dependencies before dependants while retaining sorted peers', async t => {
  const result = await fixture(t, {a: {name: 'consumer', dependencies: {library: '^1.0.0', external: '^2.0.0'}}, b: {name: 'library'}, c: {name: 'peer'}})
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'library\npeer\nconsumer\n')
})

test('workspace check rejects duplicate names and dependency cycles', async t => {
  const duplicate = await fixture(t, {a: {name: 'same'}, b: {name: 'same'}})
  assert.notEqual(duplicate.status, 0)
  assert.match(duplicate.stderr, /Duplicate workspace package name/)
  const cycle = await fixture(t, {a: {name: 'a', dependencies: {b: '^1'}}, b: {name: 'b', dependencies: {a: '^1'}}})
  assert.notEqual(cycle.status, 0)
  assert.match(cycle.stderr, /Workspace dependency cycle/)
})

test('workspace check requires a private root and publishable dependency references', async t => {
  const publicRoot = await fixture(t, {a: {name: 'a'}}, false)
  assert.notEqual(publicRoot.status, 0)
  assert.match(publicRoot.stderr, /Workspace root must be private/)
  for (const value of ['workspace:*', 'file:../b', 'link:../b']) {
    const invalid = await fixture(t, {a: {name: 'a', dependencies: {b: value}}})
    assert.notEqual(invalid.status, 0)
    assert.match(invalid.stderr, /Unpublishable dependency/)
  }
})
