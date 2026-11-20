import assert from 'node:assert/strict'
import test from 'node:test'
import {assertPublicInventory, planConsumers} from '../package/install.mjs'

const record = (name: string, directory: string, dependencies: Record<string, string> = {}) => ({
  name, directory, version: '1.0.0', dependencies, archive: name + '.tgz', sha256: 'hash', integrity: 'sha512-hash', files: ['package.json'],
})
const core = record('@fixture/core', 'core')
const validator = record('@fixture/validator', 'validator', {'@fixture/core': '1.0.0'})
const creator = record('@fixture/creator', 'creator', {'@fixture/validator': '1.0.0'})

test('public package consumers require an exact owned scenario and transitive workspace closure', () => {
  const scenarios = new Map([[core.name, {}], [validator.name, {}], [creator.name, {}]])
  const plans = planConsumers([core, validator, creator], scenarios)
  assert.deepEqual(plans.map(plan => [plan.item.name, plan.packages.map(item => item.name)]), [
    [core.name, [core.name]], [validator.name, [core.name, validator.name]],
    [creator.name, [core.name, validator.name, creator.name]],
  ])
  assert.throws(() => planConsumers([core, validator, creator], new Map([[core.name, {}], [validator.name, {}]])), /scenario/i)
  assert.throws(() => planConsumers([core, validator], scenarios), /scenario/i)
  assert.throws(() => planConsumers([core, validator, {...creator, dependencies: {[validator.name]: '2.0.0'}}], scenarios), /version/i)
})

test('prepared inventory must match every public workspace including dependency versions', () => {
  const packages = [core, validator, creator]
  const expected = packages.map(({name, directory, version, dependencies}) => ({name, directory, version, dependencies}))
  assertPublicInventory(packages, expected)
  assert.throws(() => assertPublicInventory(packages.slice(0, 2), expected), /inventory/i)
  assert.throws(() => assertPublicInventory(packages, expected.slice(0, 2)), /inventory/i)
  assert.throws(() => assertPublicInventory(packages, expected.map(item => item.name === creator.name ? {...item, version: '2.0.0'} : item)), /inventory/i)
})

test('a third public package is packed, installed with its closure, typechecked and executed', async () => {
  const {mkdtemp, mkdir, writeFile, readFile, symlink, copyFile, rm} = await import('node:fs/promises')
  const {resolve} = await import('node:path')
  const {fileURLToPath} = await import('node:url')
  const {spawnSync} = await import('node:child_process')
  const {createHash} = await import('node:crypto')
  const {createInstaller, runScenarios} = await import('../package/install.mjs')
  const workspace = fileURLToPath(new URL('../../', import.meta.url))
  await mkdir(resolve(workspace, 'artifacts/work'), {recursive: true})
  const root = await mkdtemp(resolve(workspace, 'artifacts/work/installed-workspaces-'))
  const run = (command: string, args: string[], cwd: string) => {
    const child = spawnSync(command, args, {cwd, encoding: 'utf8', timeout: 120000,
      env: {...process.env, npm_config_cache: resolve(workspace, 'artifacts/cache/npm')}})
    assert.equal(child.status, 0, child.stderr || child.stdout)
    return child.stdout
  }
  try {
    await symlink(resolve(workspace, 'node_modules'), resolve(root, 'node_modules'))
    await copyFile(resolve(workspace, 'package-lock.json'), resolve(root, 'package-lock.json'))
    const archives = resolve(root, 'artifacts/packages')
    await mkdir(archives, {recursive: true})
    const packages = []
    const scenarios = new Map()
    for (const [index, name] of ['core', 'validator', 'creator'].entries()) {
      const directory = resolve(root, 'fixtures', name)
      await mkdir(resolve(directory, 'dist'), {recursive: true})
      const packageName = '@fixture/' + name
      const previous = index ? '@fixture/' + ['core', 'validator'][index - 1] : null
      const dependencies = previous ? {[previous]: '1.0.0'} : {}
      await writeFile(resolve(directory, 'package.json'), JSON.stringify({name: packageName, version: '1.0.0', type: 'module', exports: {'.': {import: './dist/index.js', types: './dist/index.d.ts'}}, dependencies}))
      await writeFile(resolve(directory, 'dist/index.js'), previous ? `import {value as previousValue} from '${previous}'; export const value = previousValue + 1` : 'export const value = 1')
      await writeFile(resolve(directory, 'dist/index.d.ts'), 'export declare const value: number')
      const [packed] = JSON.parse(run('npm', ['pack', directory, '--ignore-scripts', '--pack-destination', archives, '--json'], root))
      const archive = resolve(archives, packed.filename)
      packages.push({name: packageName, directory: name, version: '1.0.0', dependencies, archive,
        sha256: createHash('sha256').update(await readFile(archive)).digest('hex'), integrity: packed.integrity,
        files: packed.files.map((item: {path: string}) => item.path)})
      scenarios.set(packageName, async () => ({code: `import assert from 'node:assert/strict'; import {value} from '${packageName}'; assert.equal(value, ${index + 1})`,
        nodeTypes: `import {value} from '${packageName}'; const result: number = value; void result`,
        browserTypes: `import {value} from '${packageName}'; const result: number = value; void result`}))
    }
    const plans = planConsumers(packages, scenarios)
    const installer = createInstaller({root, packages, plans, installedPaths: {}, run})
    await installer.prepare()
    const proof = await installer.verifyPrepared()
    assert.equal(proof.consumers.length, 3)
    assert.deepEqual(proof.consumers[2].packages.map(item => item.name), ['@fixture/core', '@fixture/validator', '@fixture/creator'])
    const receipts = runScenarios(plans, proof, root, script => run(process.execPath, [script], root), process.versions.node)
    assert.deepEqual(receipts.map(item => item.package), packages.map(item => item.name))
    const scenarioPath = resolve(root, 'artifacts/consumers/creator/consumer.mjs')
    const originalScenario = await readFile(scenarioPath)
    await writeFile(scenarioPath, 'throw new Error("tampered")')
    await assert.rejects(installer.verifyPrepared(), /proof/i)
    await writeFile(scenarioPath, originalScenario)
    const archive = packages[2].archive, originalArchive = await readFile(archive)
    await writeFile(archive, Buffer.from('tampered'))
    await assert.rejects(installer.verifyPrepared(), /SHA-256 mismatch/)
    await writeFile(archive, originalArchive)
    const installed = resolve(root, 'artifacts/consumers/creator/node_modules/@fixture/creator')
    await rm(installed, {recursive: true, force: true})
    await symlink(resolve(root, 'fixtures/creator'), installed)
    await assert.rejects(installer.verifyPrepared(), /source-workspace fallback/)

  } finally { await rm(root, {recursive: true, force: true}) }
})
