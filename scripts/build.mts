import {build} from 'esbuild'
import {spawnSync} from 'node:child_process'
import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises'
import {dirname, resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {packagesInOrder, root} from './workspaces.mjs'

for (const item of await packagesInOrder()) {
  const directory = fileURLToPath(item.path)
  const entries = Object.entries(item.manifest.exports ?? {})
  if (!entries.length) continue
  const output = resolve(directory, 'dist')
  await rm(output, {recursive: true, force: true})
  await mkdir(output, {recursive: true})
  if (item.directory === 'core') {
    const compiler = resolve(root, 'node_modules/typescript/bin/tsc')
    const result = spawnSync(process.execPath, [compiler, '-p', resolve(directory, 'tsconfig.json')], {stdio: 'inherit'})
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
  let validatorDeclarations
  if (item.directory === 'validator') {
    validatorDeclarations = resolve(root, 'artifacts/types/validator-declarations')
    await rm(validatorDeclarations, {recursive: true, force: true})
    const compiler = resolve(root, 'node_modules/typescript/bin/tsc')
    const result = spawnSync(process.execPath, [compiler, '-p', resolve(directory, 'tsconfig.json'),
      '--noEmit', 'false', '--declaration', '--emitDeclarationOnly', '--outDir', validatorDeclarations], {stdio: 'inherit'})
    if (result.status !== 0) process.exit(result.status ?? 1)
    for (const relative of ['browser/session.d.ts', 'validation/validate-crate.d.ts']) {
      await mkdir(dirname(resolve(output, relative)), {recursive: true})
      await cp(resolve(validatorDeclarations, relative), resolve(output, relative))
    }
  }
  const included = new Map<string, {name: string, version: string, license?: unknown}>()
  for (const [entry] of entries) {
    const name = entry === '.' ? 'index' : entry.slice(2)
    const entryFile = `src/${name}.ts`
    const result = await build({
      absWorkingDir: directory, entryPoints: [entryFile], outfile: resolve(output, `${name}.js`),
      format: 'esm', target: 'es2022', platform: 'browser', bundle: true, metafile: true,
      external: name === 'worker' ? [] : Object.keys(item.manifest.dependencies ?? {}), legalComments: 'eof',
    })
    if (item.directory !== 'core') {
      const declaration = resolve(validatorDeclarations!, `${name}.d.ts`)
      await cp(declaration, resolve(output, `${name}.d.ts`))
    }
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
