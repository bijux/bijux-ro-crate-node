import {build} from 'esbuild'
import ts from 'typescript'
import {spawnSync} from 'node:child_process'
import {access, cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile} from 'node:fs/promises'
import {dirname, relative, resolve, sep} from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {packagesInOrder, root} from './workspaces.mjs'

async function verifyDeclarations(output: string, directory = output): Promise<void> {
  for (const item of await readdir(directory, {withFileTypes: true})) {
    const file = resolve(directory, item.name)
    if (item.isDirectory()) { await verifyDeclarations(output, file); continue }
    if (!/\.d\.(?:ts|mts|cts)$/.test(item.name)) continue
    const source = await readFile(file, 'utf8')
    const parsed = ts.preProcessFile(source, true, true)
    const dependencies = [
      ...parsed.importedFiles.filter(reference => /^\.{1,2}\//.test(reference.fileName))
        .map(reference => ({name: reference.fileName, module: true})),
      ...parsed.referencedFiles.map(reference => ({name: reference.fileName, module: false})),
    ]
    for (const reference of dependencies) {
      const target = reference.module
        ? ts.resolveModuleName(reference.name, file, {module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext}, ts.sys).resolvedModule?.resolvedFileName
        : resolve(dirname(file), reference.name)
      if (!target) throw new Error('Missing declaration dependency: ' + reference.name + ' in ' + file)
      const candidate = resolve(target)
      if (relative(output, candidate).startsWith('..' + sep)) throw new Error('Declaration escapes package: ' + file)
      let actual: string
      try { actual = await realpath(candidate) } catch { throw new Error('Missing declaration dependency: ' + candidate) }
      if (relative(output, actual).startsWith('..' + sep)) throw new Error('Declaration escapes package: ' + file)
      if (!(await stat(actual)).isFile() || !/\.d\.(?:ts|mts|cts)$/.test(actual))
        throw new Error('Missing declaration dependency: ' + candidate)
    }
  }
}

async function verifyPublicDeclarationDependencies(output: string, entries: string[], packageName: string, declared: Set<string>) {
  const pending = [...entries], visited = new Set<string>()
  const compiler = {module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext}
  while (pending.length) {
    const file = resolve(pending.pop()!)
    if (visited.has(file)) continue
    visited.add(file)
    const source = await readFile(file, 'utf8')
    const parsed = ts.preProcessFile(source, true, true)
    for (const reference of parsed.referencedFiles) pending.push(resolve(dirname(file), reference.fileName))
    for (const reference of parsed.typeReferenceDirectives) {
      const typePackage = reference.fileName.startsWith('@types/') ? reference.fileName : '@types/' + reference.fileName
      if (!declared.has(typePackage)) throw new Error('Undeclared declaration dependency: ' + typePackage + ' in ' + file)
    }
    for (const reference of parsed.importedFiles) {
      const name = reference.fileName
      if (/^\.{1,2}\//.test(name)) {
        const target = ts.resolveModuleName(name, file, compiler, ts.sys).resolvedModule?.resolvedFileName
        if (!target || relative(output, target).startsWith('..' + sep)) throw new Error('Missing declaration dependency: ' + name + ' in ' + file)
        pending.push(target)
        continue
      }
      const packageRoot = name.startsWith('node:') ? '@types/node' : name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]
      const typesName = packageRoot.startsWith('@') ? '@types/' + packageRoot.slice(1).replace('/', '__') : '@types/' + packageRoot
      if (packageRoot !== packageName && !declared.has(packageRoot) && !declared.has(typesName))
        throw new Error('Undeclared declaration dependency: ' + packageRoot + ' in ' + file)
      const target = ts.resolveModuleName(name, file, compiler, ts.sys).resolvedModule
      if (target?.packageId?.name.startsWith('@types/') && !declared.has(target.packageId.name))
        throw new Error('Undeclared declaration dependency: ' + target.packageId.name + ' in ' + file)
    }
  }
}

for (const item of await packagesInOrder()) {
  if (item.manifest.private) continue
  const directory = fileURLToPath(item.path)
  const entries = Object.entries(item.manifest.exports ?? {})
  if (!entries.length) continue
  const output = resolve(directory, 'dist')
  await rm(output, {recursive: true, force: true})
  await mkdir(output, {recursive: true})
  const declarations = resolve(root, 'artifacts/types', item.directory)
  await rm(declarations, {recursive: true, force: true})
  const compiler = resolve(root, 'node_modules/typescript/bin/tsc')
  const result = spawnSync(process.execPath, [compiler, '-p', resolve(directory, item.manifest.bijux.declarations),
    '--noEmit', 'false', '--noCheck', 'false', '--declaration', '--emitDeclarationOnly', '--outDir', declarations], {stdio: 'inherit'})
  if (result.status !== 0) process.exit(result.status ?? 1)
  await cp(declarations, output, {recursive: true})
  await verifyDeclarations(output)
  const publicDeclarations = entries.map(([entry]) => resolve(output, (entry === '.' ? 'index' : entry.slice(2)) + '.d.ts'))
  await verifyPublicDeclarationDependencies(output, publicDeclarations, item.manifest.name,
    new Set([...Object.keys(item.manifest.dependencies ?? {}), ...Object.keys(item.manifest.peerDependencies ?? {})]))
  const included = new Map<string, {name: string, version: string, license?: unknown}>()
  for (const [entry] of entries) {
    const name = entry === '.' ? 'index' : entry.slice(2)
    const entryFile = `src/${name}.ts`
    await access(resolve(output, `${name}.d.ts`))
    const result = await build({
      absWorkingDir: directory, entryPoints: [entryFile], outfile: resolve(output, `${name}.js`),
      format: 'esm', target: 'es2022', platform: 'browser', bundle: true, metafile: true,
      external: item.manifest.bijux.standaloneEntries.includes(entry) ? [] : Object.keys(item.manifest.dependencies ?? {}), legalComments: 'eof',
    })
    for (const source of Object.keys(result.metafile.inputs)) {
      if (!source.includes('node_modules/')) continue
      let parent = dirname(resolve(directory, source))
      while (parent !== dirname(parent)) {
        try {
          const manifest = JSON.parse(await readFile(resolve(parent, 'package.json'), 'utf8')) as {name: string, version: string, license?: unknown}
          if (manifest.name && manifest.version) {included.set(parent, manifest); break}
        } catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error}
        parent = dirname(parent)
      }
    }
  }
  for (const [directory, manifest] of included) {
    const licenses = (await readdir(directory)).filter(name => /^(?:licen[cs]e|copying|notice)(?:[._-]|$)/i.test(name))
    if (!licenses.length) {
      const fallback = resolve(fileURLToPath(item.path), 'LICENSES/bundled', manifest.name)
      const source = JSON.parse(await readFile(resolve(fallback, 'SOURCE.json'), 'utf8'))
      if (source.name !== manifest.name || source.version !== manifest.version || source.license !== manifest.license)
        throw new Error('Bundled license provenance does not match installed dependency: ' + manifest.name)
      const license = await readFile(resolve(fallback, 'LICENSE.txt'))
      if (createHash('sha256').update(license).digest('hex') !== source.license_sha256)
        throw new Error('Bundled license text does not match provenance: ' + manifest.name)
      await cp(fallback, resolve(output, 'licenses', manifest.name), {recursive: true})
    }
    for (const file of licenses) {
      const destination = resolve(output, 'licenses', manifest.name)
      await mkdir(destination, {recursive: true})
      await cp(resolve(directory, file), resolve(destination, file))
    }
  }
  await writeFile(resolve(output, 'third-party.json'), JSON.stringify([...included.values()].map(
    ({name, version, license}) => ({name, version, license})).sort((a, b) => a.name.localeCompare(b.name)), null, 2) + '\n')
  console.log('Built ' + item.manifest.name)
}
