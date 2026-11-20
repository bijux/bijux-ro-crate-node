import assert from 'node:assert/strict'
import {readFile, writeFile, mkdir, rm, realpath} from 'node:fs/promises'
import {relative, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash, type BinaryLike} from 'node:crypto'
import {parseJson, packageLockField, versionField, packedFilename} from './receipts.mjs'

export type PackageRecord = {name: string; directory: string; version: string; dependencies: Record<string, string>; archive: string; sha256: string; integrity: string; files: string[]}

export function assertPublicInventory(packages: PackageRecord[], workspaces: Array<Pick<PackageRecord, 'name' | 'directory' | 'version' | 'dependencies'>>) {
  const inventory = packages.map(({name, directory, version, dependencies}) => ({name, directory, version, dependencies}))
  assert.deepEqual(inventory, workspaces, 'Packed package inventory differs from public workspaces')
}

export function planConsumers<T>(packages: PackageRecord[], scenarios: ReadonlyMap<string, T>) {
  for (const item of packages) assert.match(item.directory, /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'Invalid consumer directory')
  const byName = new Map(packages.map(item => [item.name, item]))
  assert.equal(byName.size, packages.length, 'Duplicate public package')
  assert.equal(new Set(packages.map(item => item.directory)).size, packages.length, 'Duplicate consumer directory')
  assert.deepEqual([...scenarios.keys()].sort(), [...byName.keys()].sort(), 'Each public package requires exactly one installed scenario')
  return packages.map(item => {
    const included = new Set<string>()
    const active = new Set<string>()
    function visit(current: PackageRecord) {
      if (included.has(current.name)) return
      assert.ok(!active.has(current.name), 'Workspace dependency cycle')
      active.add(current.name)
      for (const [name, version] of Object.entries(current.dependencies)) {
        const dependency = byName.get(name)
        if (!dependency) continue
        assert.equal(dependency.version, version, 'Workspace dependency version mismatch: ' + name)
        visit(dependency)
      }
      active.delete(current.name)
      included.add(current.name)
    }
    visit(item)
    return {item, packages: packages.filter(dependency => included.has(dependency.name)), scenario: scenarios.get(item.name)!}
  })
}

export type Scenario = {code: string; nodeTypes: string; browserTypes: string; prepare?: (directory: string) => Promise<void>}

export function createInstaller({root, packages, plans, installedPaths, run}: {root: string; packages: PackageRecord[]; plans: ReturnType<typeof planConsumers<() => Promise<Scenario>>>; installedPaths: Record<string, string>; run: (command: string, args: string[], cwd: string) => string}) {
  const proofPath = resolve(root, 'artifacts/consumers/proof.json')
  const sha256 = (bytes: BinaryLike) => createHash('sha256').update(bytes).digest('hex')
  const portable = (path: string) => relative(root, path).replaceAll('\\', '/')

  async function archiveProof() {
    for (const item of packages) {
      const bytes = await readFile(item.archive)
      assert.equal(sha256(bytes), item.sha256, 'Package archive SHA-256 mismatch')
      const [algorithm, digest] = item.integrity.split('-')
      assert.equal(createHash(algorithm).update(bytes).digest('base64'), digest, 'Package archive integrity mismatch')
    }
  }

  async function consumerProof() {
    await archiveProof()
    const consumers = []
    for (const plan of plans) {
      const name = plan.item.directory, selected = plan.packages
      const directory = resolve(root, 'artifacts/consumers', name)
      const lock = parseJson(await readFile(resolve(directory, 'package-lock.json'), 'utf8'))
      const installed = []
      for (const item of selected) {
        assert.equal(packageLockField(lock, 'node_modules/' + item.name, 'integrity'), item.integrity, 'Installed archive integrity mismatch')
        const url = run('node', ['--input-type=module', '--eval', `console.log(import.meta.resolve(${JSON.stringify(item.name)}))`], directory).trim()
        assert.ok((await realpath(fileURLToPath(url))).startsWith(directory + '/node_modules/'), 'Consumer resolved a source-workspace fallback')
        const files = []
        for (const path of item.files) {
          const target = resolve(directory, 'node_modules', item.name, path)
          assert.ok((await realpath(target)).startsWith(directory + '/node_modules/'), 'Installed file escapes the consumer')
          files.push({path, sha256: sha256(await readFile(target))})
        }
        installed.push({name: item.name, archive: portable(item.archive), sha256: item.sha256,
          integrity: item.integrity, entry: portable(fileURLToPath(url)), files})
      }
      const scenario = sha256(await readFile(resolve(directory, 'consumer.mjs')))
      consumers.push({name, directory: portable(directory), packages: installed, scenario_sha256: scenario})
    }
    return {consumers, installedPaths}
  }

  async function verifyPrepared() {
    const expected = parseJson(await readFile(proofPath, 'utf8'))
    const actual = await consumerProof()
    assert.deepEqual(actual, expected, 'Prepared consumer contents differ from their package proof')
    return actual
  }

  async function prepare() {
    await archiveProof()
    const typeDirectory = resolve(root, 'artifacts/tools/consumer-types')
    await mkdir(typeDirectory, {recursive: true})
    const rootLock = parseJson(await readFile(resolve(root, 'package-lock.json'), 'utf8'))
    const typeArchives = []
    for (const name of ['@types/node', 'undici-types']) {
      const installed = resolve(root, 'node_modules', name)
      const manifest = versionField(parseJson(await readFile(resolve(installed, 'package.json'), 'utf8')))
      assert.equal(manifest, packageLockField(rootLock, 'node_modules/' + name, 'version'))
      const packed = packedFilename(parseJson(run('npm', ['pack', installed, '--ignore-scripts', '--pack-destination', typeDirectory, '--json'], root)))
      typeArchives.push(resolve(typeDirectory, packed))
    }
    for (const plan of plans) {
      const name = plan.item.directory, selected = plan.packages
      const directory = resolve(root, 'artifacts/consumers', name)
      await rm(directory, {recursive: true, force: true})
      await mkdir(directory, {recursive: true})
      await writeFile(resolve(directory, 'package.json'), JSON.stringify({name: `bijux-${name}-consumer`, version: '1.0.0', private: true, type: 'module'}))
      run('npm', ['install', '--ignore-scripts', '--offline', '--no-audit', ...selected.map(item => item.archive)], directory)
      const lock = parseJson(await readFile(resolve(directory, 'package-lock.json'), 'utf8'))
      for (const item of selected) assert.equal(packageLockField(lock, 'node_modules/' + item.name, 'integrity'), item.integrity, 'Installed archive integrity mismatch')
      for (const item of selected) {
        const url = run('node', ['--input-type=module', '--eval', `console.log(import.meta.resolve(${JSON.stringify(item.name)}))`], directory).trim()
        assert.ok((await realpath(fileURLToPath(url))).startsWith(directory + '/node_modules/'), 'Consumer resolved a source-workspace fallback')
      }
      const scenario = await plan.scenario()
      await writeFile(resolve(directory, 'consumer.mjs'), scenario.code)
      run('npm', ['install', '--save-dev', '--ignore-scripts', '--offline', '--no-audit', ...typeArchives], directory)
      await writeFile(resolve(directory, 'node.ts'), scenario.nodeTypes)
      const compiler = resolve(root, 'node_modules/typescript/bin/tsc')
      const sharedTypes = ['--noEmit', '--strict', '--module', 'nodenext', '--target', 'ES2022']
      run('node', [compiler, ...sharedTypes, '--lib', 'ES2022', '--typeRoots', resolve(directory, 'node_modules/@types'), '--types', 'node', 'node.ts'], directory)
      await writeFile(resolve(directory, 'consumer.ts'), scenario.browserTypes)
      await mkdir(resolve(directory, 'browser-types'), {recursive: true})
      run('node', [compiler, ...sharedTypes, '--lib', 'ES2022,DOM,DOM.Iterable', '--typeRoots', resolve(directory, 'browser-types'), 'consumer.ts'], directory)
      if (scenario.prepare) await scenario.prepare(directory)
    }

    const proof = await consumerProof()
    await writeFile(proofPath, JSON.stringify(proof, null, 2) + '\n')
    return {prepared: true, strict_node_typescript: true, strict_browser_typescript: true, ...proof}
  }


  return {prepare, verifyPrepared}
}

export function runScenarios(plans: ReturnType<typeof planConsumers<() => Promise<Scenario>>>, proof: {consumers: Array<{name: string; packages: Array<{name: string; entry: string}>; scenario_sha256: string}>}, root: string, execute: (path: string) => string, nodeVersion: string) {
  assert.deepEqual(proof.consumers.map(item => item.name), plans.map(plan => plan.item.directory), 'Scenario receipt inventory differs')
  return plans.map((plan, index) => {
    const consumer = proof.consumers[index]
    const installed = consumer.packages.find(item => item.name === plan.item.name)
    assert.ok(installed, 'Scenario lacks its installed package')
    execute(resolve(root, 'artifacts/consumers', plan.item.directory, 'consumer.mjs'))
    return {package: plan.item.name, node_version: nodeVersion, distribution: 'installed', imported_module: installed.entry,
      scenario_sha256: consumer.scenario_sha256}
  })
}
