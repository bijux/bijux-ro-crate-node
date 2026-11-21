import {readdir, readFile, realpath, stat} from 'node:fs/promises'
import {isAbsolute, relative, resolve, sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import ts from 'typescript'
import {packagesInOrder, root as workspaceRoot} from '../workspaces.mjs'

export interface BoundaryPackage {
  name: string
  directory: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  exports?: Record<string, unknown>
}

function inside(parent: string, child: string) {
  const path = relative(parent, child)
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep))
}

async function sources(directory: string, ancestors = new Set<string>()): Promise<string[]> {
  let entries
  try { entries = await readdir(directory, {withFileTypes: true}) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const actual = await realpath(directory)
  if (ancestors.has(actual)) throw new Error('Boundary scan found a source symlink cycle: ' + directory)
  const parents = new Set(ancestors).add(actual)
  const files: string[] = []
  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    const type = entry.isSymbolicLink() ? await stat(path) : entry
    if (type.isDirectory()) files.push(...await sources(path, parents))
    else if (type.isFile() && /\.(?:ts|tsx|mts|cts)$/.test(entry.name)) files.push(path)
  }
  return files
}

function imports(source: ts.SourceFile) {
  const values: string[] = []
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
      values.push(node.moduleSpecifier.text)
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression))
      values.push(node.moduleReference.expression.text)
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal))
      values.push(node.argument.literal.text)
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')) && node.arguments.length && ts.isStringLiteralLike(node.arguments[0]))
      values.push(node.arguments[0].text)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return values
}

export async function checkBoundaries(root: string, packages: readonly BoundaryPackage[]) {
  const base = await realpath(root)
  const owners = packages.map(item => ({...item, path: resolve(base, 'packages', item.directory)}))
  const support = resolve(base, 'tests/support')
  const files = [...(await Promise.all(owners.map(item => sources(resolve(item.path, 'src'))))).flat(), ...await sources(support)]
  for (const path of files) {
    const source = ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.Latest, true)
    const owner = owners.find(item => inside(resolve(item.path, 'src'), path))
    const actual = await realpath(path)
    if (owner && !inside(await realpath(resolve(owner.path, 'src')), actual))
      throw new Error(`Boundary violation: package source resolves outside its owner: ${path}`)
    if (!owner && inside(resolve(base, 'scripts/ci'), actual))
      throw new Error(`Boundary violation: shared test support resolves to an entrypoint: ${path}`)
    const configPath = ts.findConfigFile(path, ts.sys.fileExists)
    const config = configPath && ts.readConfigFile(configPath, ts.sys.readFile)
    const options = config && !config.error ? ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(configPath!, '..')).options :
      {module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, resolveJsonModule: true}
    for (const specifier of imports(source)) {
      const targetPackage = owners.find(item => specifier === item.name || specifier.startsWith(item.name + '/'))
      if (targetPackage && owner && targetPackage !== owner) {
        const subpath = specifier === targetPackage.name ? '.' : '.' + specifier.slice(targetPackage.name.length)
        const shadowed = Object.keys(options.paths ?? {}).some(pattern => {
          const [prefix, suffix] = pattern.split('*')
          return suffix === undefined ? specifier === prefix : specifier.startsWith(prefix) && specifier.endsWith(suffix)
        })
        if (shadowed) throw new Error(`Boundary violation: compiler alias shadows workspace export ${specifier}`)
        if (!(Object.hasOwn(owner.dependencies ?? {}, targetPackage.name) || Object.hasOwn(owner.peerDependencies ?? {}, targetPackage.name)) ||
            !Object.hasOwn(targetPackage.exports ?? {}, subpath))
          throw new Error(`Boundary violation: ${path} imports undeclared or private workspace export ${specifier}`)
        continue
      }
      const resolved = ts.resolveModuleName(specifier, path, options, ts.sys).resolvedModule?.resolvedFileName
      if (!resolved) {
        if (specifier.startsWith('.') || isAbsolute(specifier)) throw new Error(`Boundary cannot resolve ${specifier} from ${path}`)
        continue
      }
      const target = await realpath(resolved)
      if (owner) {
        if (['tests', 'scripts', 'examples'].some(name => inside(resolve(base, name), target) || inside(resolve(owner.path, name), target)) ||
            owners.some(item => item !== owner && inside(item.path, target)))
          throw new Error(`Boundary violation: ${path} imports ${specifier}`)
      } else if (inside(support, path) && (inside(resolve(base, 'scripts/ci'), target) ||
          (inside(resolve(base, 'tests'), target) && /(?:^|[\\/])(?:run|main)\.[cm]?[jt]s$/.test(target)))) {
        throw new Error(`Boundary violation: shared test support imports entrypoint ${specifier}`)
      }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packages = (await packagesInOrder()).map(item => ({name: item.manifest.name, directory: item.directory,
    dependencies: item.manifest.dependencies, peerDependencies: item.manifest.peerDependencies, exports: item.manifest.exports}))
  await checkBoundaries(workspaceRoot, packages)
}
