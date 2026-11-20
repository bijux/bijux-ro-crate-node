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

test('a third public package is packed, installed, restored and executed with its closure', async () => {
  const {mkdtemp, mkdir, writeFile, readFile, symlink, copyFile, rm} = await import('node:fs/promises')
  const {basename, dirname, resolve} = await import('node:path')
  const {fileURLToPath} = await import('node:url')
  const {spawnSync, execFileSync} = await import('node:child_process')
  const {createHash} = await import('node:crypto')
  const {createInstaller, runScenarios} = await import('../package/install.mjs')
  const {packBundle, restoreBundle} = await import('../../scripts/ci/runtime-bundles.mjs')
  const workspace = fileURLToPath(new URL('../../', import.meta.url))
  await mkdir(resolve(workspace, 'artifacts/work'), {recursive: true})
  const root = await mkdtemp(resolve(workspace, 'artifacts/work/installed-workspaces-'))
  const run = (command: string, args: string[], cwd: string, extraEnv: NodeJS.ProcessEnv = {}) => {
    const child = spawnSync(command, args, {cwd, encoding: 'utf8', timeout: 120000,
      env: {...process.env, npm_config_cache: resolve(workspace, 'artifacts/cache/npm'), ...extraEnv}})
    assert.equal(child.status, 0, child.stderr || child.stdout)
    return child.stdout
  }
  try {
    const gitDirectory = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {cwd: workspace, encoding: 'utf8'}).trim()
    await writeFile(resolve(root, '.git'), 'gitdir: ' + gitDirectory + '\n')
    for (const path of ['docs/compatibility/reference.json', 'tests/parity/requirements-oracle.txt']) {
      await mkdir(dirname(resolve(root, path)), {recursive: true})
      await copyFile(resolve(workspace, path), resolve(root, path))
    }
    const {cp} = await import('node:fs/promises')
    await cp(resolve(workspace, 'scripts/dependencies/patches'), resolve(root, 'scripts/dependencies/patches'), {recursive: true})
    await symlink(resolve(workspace, 'node_modules'), resolve(root, 'node_modules'))
    await copyFile(resolve(workspace, 'package-lock.json'), resolve(root, 'package-lock.json'))
    const archives = resolve(root, 'artifacts/packages')
    await mkdir(archives, {recursive: true})
    const packages = []
    const scenarios = new Map()
    for (const [index, name] of ['core', 'validator', 'creator'].entries()) {
      const directory = resolve(root, 'packages', name)
      await mkdir(resolve(directory, 'dist'), {recursive: true})
      await mkdir(resolve(directory, 'src'), {recursive: true})
      await writeFile(resolve(directory, 'src/index.ts'), 'export {}')
      await writeFile(resolve(directory, 'tsconfig.json'), '{}')
      const packageName = '@fixture/' + name
      const entry = name === 'creator' ? './feature' : '.'
      const entryName = name === 'creator' ? 'feature' : 'index'
      await writeFile(resolve(directory, 'src', entryName + '.ts'), 'export {}')
      const specifier = packageName + (entry === '.' ? '' : entry.slice(1))
      const previous = index ? '@fixture/' + ['core', 'validator'][index - 1] : null
      const dependencies = previous ? {[previous]: '1.0.0'} : {}
      await writeFile(resolve(directory, 'package.json'), JSON.stringify({name: packageName, version: '1.0.0', type: 'module', exports: {[entry]: {import: './dist/' + entryName + '.js', types: './dist/' + entryName + '.d.ts'}}, dependencies,
        scripts: {test: 'node --test'}, bijux: {declarations: 'tsconfig.json', typecheck: ['tsconfig.json'], standaloneEntries: []}}))
      await writeFile(resolve(directory, 'dist', entryName + '.js'), previous ? `import {value as previousValue} from '${previous}'; export const value = previousValue + 1` : 'export const value = 1')
      await writeFile(resolve(directory, 'dist', entryName + '.d.ts'), 'export declare const value: number')
      const [packed] = JSON.parse(run('npm', ['pack', directory, '--ignore-scripts', '--pack-destination', archives, '--json'], root))
      const archive = resolve(archives, packed.filename)
      packages.push({name: packageName, directory: name, version: '1.0.0', dependencies, archive,
        sha256: createHash('sha256').update(await readFile(archive)).digest('hex'), integrity: packed.integrity,
        files: packed.files.map((item: {path: string}) => item.path)})
      scenarios.set(packageName, async () => ({entry, code: `import assert from 'node:assert/strict'; import {value} from '${specifier}'; assert.equal(value, ${index + 1})`,
        nodeTypes: `import {value} from '${specifier}'; const result: number = value; void result`,
        browserTypes: `import {value} from '${specifier}'; const result: number = value; void result`,
        ...(index === 2 ? {prepareFiles: ['scenario.txt'], prepare: async (consumer: string) => writeFile(resolve(consumer, 'scenario.txt'), 'expected')} : {})}))
    }
    const plans = planConsumers(packages, scenarios)
    const installer = createInstaller({root, packages, plans, installedPaths: {}, run})
    const creatorScenario = scenarios.get('@fixture/creator')!
    for (const field of ['nodeTypes', 'browserTypes'] as const) {
      const noTypes = new Map(scenarios)
      noTypes.set('@fixture/creator', async () => ({...await creatorScenario(), [field]: ''}))
      const missingTypes = createInstaller({root, packages, plans: planConsumers(packages, noTypes), installedPaths: {}, run})
      await assert.rejects(missingTypes.prepare(), /declaration/i)
    }
    const noRuntime = new Map(scenarios)
    noRuntime.set('@fixture/creator', async () => ({...await creatorScenario(), code: 'void 0'}))
    const noRuntimePlans = planConsumers(packages, noRuntime)
    const noRuntimeInstaller = createInstaller({root, packages, plans: noRuntimePlans, installedPaths: {}, run})
    await noRuntimeInstaller.prepare()
    const noRuntimeProof = await noRuntimeInstaller.verifyPrepared()
    await assert.rejects(runScenarios(noRuntimePlans, noRuntimeProof, root, (args, env) => run(process.execPath, args, root, env), process.versions.node), /did not load/)
    await installer.prepare()
    const proof = await installer.verifyPrepared()
    assert.equal(proof.consumers.length, 3)
    for (const consumer of proof.consumers) for (const evidence of consumer.type_evidence)
      assert.equal(createHash('sha256').update(JSON.stringify(evidence.files) + '\n').digest('hex'), evidence.sha256)
    assert.deepEqual(proof.consumers[2].packages.map(item => item.name), ['@fixture/core', '@fixture/validator', '@fixture/creator'])
    const receipts = await runScenarios(plans, proof, root, (args, env) => run(process.execPath, args, root, env), process.versions.node)
    assert.deepEqual(receipts.map(item => item.package), packages.map(item => item.name))
    for (const receipt of receipts) assert.equal(createHash('sha256').update(await readFile(resolve(root, receipt.load_evidence))).digest('hex'), receipt.load_evidence_sha256)
    const staleScenarios = new Map(scenarios)
    staleScenarios.set('@fixture/creator', async () => { throw new Error('changed scenario') })
    const staleInstaller = createInstaller({root, packages, plans: planConsumers(packages, staleScenarios), installedPaths: {}, run})
    await assert.rejects(staleInstaller.verifyPrepared(), /changed scenario/)
    const changedPreparation = new Map(scenarios)
    changedPreparation.set('@fixture/creator', async () => ({...await creatorScenario(), prepare: async (consumer: string) => writeFile(resolve(consumer, 'scenario.txt'), 'changed')}))
    const changedInstaller = createInstaller({root, packages, plans: planConsumers(packages, changedPreparation), installedPaths: {}, run})
    await assert.rejects(changedInstaller.verifyPrepared(), /current generator/)
    await rm(resolve(root, 'node_modules'))
    await mkdir(resolve(root, 'node_modules'))
    await cp(await (await import('node:fs/promises')).realpath(resolve(workspace, 'node_modules/typescript')), resolve(root, 'node_modules/typescript'), {recursive: true})
    const bundle = await packBundle(root, 'assets')
    const restored = await mkdtemp(resolve(workspace, 'artifacts/work/restored-consumers-'))
    try {
      await writeFile(resolve(restored, '.git'), 'gitdir: ' + gitDirectory + '\n')
      for (const path of ['package-lock.json', 'docs/compatibility/reference.json', 'tests/parity/requirements-oracle.txt']) {
        await mkdir(dirname(resolve(restored, path)), {recursive: true})
        await copyFile(resolve(root, path), resolve(restored, path))
      }
      await cp(resolve(root, 'scripts/dependencies/patches'), resolve(restored, 'scripts/dependencies/patches'), {recursive: true})
      for (const item of packages) {
        const target = resolve(restored, 'packages', item.directory)
        await mkdir(target, {recursive: true})
        await copyFile(resolve(root, 'packages', item.directory, 'package.json'), resolve(target, 'package.json'))
        await copyFile(resolve(root, 'packages', item.directory, 'tsconfig.json'), resolve(target, 'tsconfig.json'))
        await cp(resolve(root, 'packages', item.directory, 'src'), resolve(target, 'src'), {recursive: true})
      }
      await mkdir(resolve(restored, 'artifacts/ci'), {recursive: true})
      await copyFile(resolve(root, bundle.path), resolve(restored, bundle.path))
      await restoreBundle(restored, 'assets', bundle.sha256)
      const restoredPackages = packages.map(item => ({...item, archive: resolve(restored, 'artifacts/packages', basename(item.archive))}))
      const restoredPlans = planConsumers(restoredPackages, scenarios)
      const restoredInstaller = createInstaller({root: restored, packages: restoredPackages, plans: restoredPlans, installedPaths: {}, run})
      const restoredProof = await restoredInstaller.verifyPrepared()
      const restoredReceipts = await runScenarios(restoredPlans, restoredProof, restored, (args, env) => run(process.execPath, args, restored, env), process.versions.node)
      assert.deepEqual(restoredReceipts.map(item => item.package), packages.map(item => item.name))
    } finally { await rm(restored, {recursive: true, force: true}) }
    const scenarioPath = resolve(root, 'artifacts/consumers/creator/consumer.mjs')
    const originalScenario = await readFile(scenarioPath)
    await writeFile(scenarioPath, 'throw new Error("tampered")')
    await assert.rejects(installer.verifyPrepared(), /scenario|proof/i)
    await writeFile(scenarioPath, originalScenario)
    const archive = packages[2].archive, originalArchive = await readFile(archive)
    await writeFile(archive, Buffer.from('tampered'))
    await assert.rejects(installer.verifyPrepared(), /SHA-256 mismatch/)
    await writeFile(archive, originalArchive)
    const installed = resolve(root, 'artifacts/consumers/creator/node_modules/@fixture/creator')
    await rm(installed, {recursive: true, force: true})
    await symlink(resolve(root, 'packages/creator'), installed)
    await assert.rejects(installer.verifyPrepared(), /source-workspace fallback/)

  } finally { await rm(root, {recursive: true, force: true}) }
})
