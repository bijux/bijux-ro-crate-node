import {readdir, readFile, realpath, stat} from 'node:fs/promises'
import {dirname, isAbsolute, relative, resolve, sep} from 'node:path'
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
    else if (type.isFile() && /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(entry.name)) files.push(path)
  }
  return files
}

function imports(source: ts.SourceFile, provenNodeNextEsm: boolean) {
  const values: Array<{specifier: string, runtime: boolean, mode?: ts.ResolutionMode}> = []
  // Bind just this source: scope resolution must not mistake a local function
  // named require for Node's CommonJS loader.
  const options: ts.CompilerOptions = {noLib:true, noResolve:true, allowJs:true}
  const host = ts.createCompilerHost(options)
  host.getSourceFile = name => name === source.fileName ? source : undefined
  const checker = ts.createProgram([source.fileName], options, host).getTypeChecker()
  const isCreateRequire = (expression: ts.Expression): boolean => {
    if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'createRequire' && ts.isIdentifier(expression.expression)) {
      const namespace = checker.getSymbolAtLocation(expression.expression)
      return (namespace?.declarations ?? []).some(declaration => {
        if (!ts.isNamespaceImport(declaration)) return false
        const statement = declaration.parent.parent
        return ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) &&
          ['node:module', 'module'].includes(statement.moduleSpecifier.text)
      })
    }
    if (!ts.isIdentifier(expression)) return false
    const symbol = checker.getSymbolAtLocation(expression)
    return (symbol?.declarations ?? []).some(declaration => {
      if (!ts.isImportSpecifier(declaration)) return false
      const imported = declaration.propertyName?.text ?? declaration.name.text
      const statement = declaration.parent.parent.parent
      return imported === 'createRequire' && ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) && ['node:module', 'module'].includes(statement.moduleSpecifier.text)
    })
  }
  const literalArgument = (expression: ts.Expression): ts.Expression => {
    while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) ||
      ts.isTypeAssertionExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isNonNullExpression(expression))
      expression = expression.expression
    return expression
  }
  const wrapperVar = (declaration: ts.VariableDeclaration): boolean => {
    if (/\.m(?:js|ts)$/.test(source.fileName) || provenNodeNextEsm || !ts.isVariableDeclarationList(declaration.parent) ||
        (declaration.parent.flags & ts.NodeFlags.BlockScoped) !== 0) return false
    for (let node: ts.Node = declaration.parent; node.parent; node = node.parent) {
      if (ts.isFunctionLike(node) || ts.isClassStaticBlockDeclaration(node)) return false
      if (ts.isSourceFile(node.parent)) return true
    }
    return false
  }
  const isRequireLoader = (expression: ts.Expression): boolean => {
    if (!ts.isIdentifier(expression) || expression.text !== 'require') return false
    const declarations = checker.getSymbolAtLocation(expression)?.declarations
    if (!declarations?.length) return true
    return declarations.some(declaration => {
      if ((ts.getCombinedModifierFlags(declaration as ts.Declaration) & ts.ModifierFlags.Ambient) !== 0) return true
      if (!ts.isVariableDeclaration(declaration)) return false
      if (wrapperVar(declaration)) return true
      const initializer = declaration.initializer && literalArgument(declaration.initializer)
      return !!initializer && ts.isCallExpression(initializer) && isCreateRequire(literalArgument(initializer.expression))
    })
  }
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause
      const typeOnly = clause?.isTypeOnly || (clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every(item => item.isTypeOnly))
      values.push({specifier: node.moduleSpecifier.text, runtime: !typeOnly})
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const typeOnly = node.isTypeOnly || (node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every(item => item.isTypeOnly))
      values.push({specifier: node.moduleSpecifier.text, runtime: !typeOnly})
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression))
      values.push({specifier: node.moduleReference.expression.text, runtime: !node.isTypeOnly, mode: ts.ModuleKind.CommonJS})
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal))
      values.push({specifier: node.argument.literal.text, runtime: false})
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || isRequireLoader(node.expression)) && node.arguments.length) {
      const argument = literalArgument(node.arguments[0])
      if (!ts.isStringLiteralLike(argument)) {
        const {line, character} = source.getLineAndCharacterOfPosition(node.getStart(source))
        throw new Error(`Boundary violation: non-literal module specifier in ${source.fileName}:${line + 1}:${character + 1}`)
      }
      values.push({specifier: argument.text, runtime: true, mode: node.expression.kind === ts.SyntaxKind.ImportKeyword ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS})
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return values
}

async function verifyWorkspaceImport(path: string, targetPackage: BoundaryPackage & {path: string}, subpath: string, options: ts.CompilerOptions) {
  let directory = dirname(path)
  let packageRoot: string | undefined
  while (true) {
    const candidate = resolve(directory, 'node_modules', targetPackage.name)
    if (ts.sys.fileExists(resolve(candidate, 'package.json'))) {packageRoot = candidate; break}
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  const expectedRoot = await realpath(targetPackage.path)
  if (!packageRoot || await realpath(packageRoot) !== expectedRoot)
    throw new Error(`Boundary violation: workspace package resolves outside its owner: ${targetPackage.name}`)
  const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8')) as {exports?: Record<string, unknown>}
  const expected = targetPackage.exports?.[subpath] as {types?: unknown, import?: unknown} | undefined
  if (!expected || typeof expected.types !== 'string' || typeof expected.import !== 'string' ||
      JSON.stringify(manifest.exports?.[subpath]) !== JSON.stringify(expected))
    throw new Error(`Boundary violation: workspace package export differs from its owner: ${targetPackage.name}${subpath}`)
  const entry = subpath === '.' ? 'index' : subpath.slice(2)
  const declaration = resolve(expectedRoot, expected.types)
  const runtime = resolve(expectedRoot, expected.import)
  const source = resolve(expectedRoot, 'src', entry + '.ts')
  for (const file of [declaration, runtime, source]) {
    if (ts.sys.fileExists(file) && await realpath(file) !== file)
      throw new Error(`Boundary violation: workspace package export differs from its owned path: ${targetPackage.name}`)
  }
  const specifier = targetPackage.name + (subpath === '.' ? '' : subpath.slice(1))
  const resolved = ts.resolveModuleName(specifier, path, options, ts.sys, undefined, undefined, ts.ModuleKind.ESNext).resolvedModule?.resolvedFileName
  if (!resolved && !ts.sys.fileExists(source))
    throw new Error(`Boundary violation: workspace declaration and source cannot be resolved: ${specifier}`)
  if (resolved && ![declaration, source].includes(await realpath(resolved)))
    throw new Error(`Boundary violation: workspace declaration differs from its export: ${specifier}`)
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
    if (!owner && !inside(support, actual))
      throw new Error(`Boundary violation: shared test support resolves outside its owner: ${path}`)
    const toolingConfig = resolve(base, 'tsconfig.tooling.json')
    const configPath = !owner && ts.sys.fileExists(toolingConfig) ? toolingConfig : ts.findConfigFile(path, ts.sys.fileExists)
    const config = configPath && ts.readConfigFile(configPath, ts.sys.readFile)
    const parsed = config && !config.error ? ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(configPath!, '..')) : undefined
    const options = parsed?.options ??
      {module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, resolveJsonModule: true}
    // Treat ambiguous or relocated sources as potentially CommonJS. The parsed
    // NodeNext config and nearest package scope must both establish ESM.
    const provenNodeNextEsm = !!parsed && parsed.errors.length === 0 && path === actual &&
      parsed.fileNames.some(file => resolve(file) === path) && options.module === ts.ModuleKind.NodeNext && options.moduleResolution === ts.ModuleResolutionKind.NodeNext &&
      ts.getImpliedNodeFormatForFile(path, undefined, ts.sys, options) === ts.ModuleKind.ESNext
    for (const {specifier, runtime, mode} of imports(source, provenNodeNextEsm)) {
      const targetPackage = owners.find(item => specifier === item.name || specifier.startsWith(item.name + '/'))
      if (targetPackage && !owner) {
        const subpath = specifier === targetPackage.name ? '.' : '.' + specifier.slice(targetPackage.name.length)
        const shadowed = Object.keys(options.paths ?? {}).some(pattern => {
          const [prefix, suffix] = pattern.split('*')
          return suffix === undefined ? specifier === prefix : specifier.startsWith(prefix) && specifier.endsWith(suffix)
        })
        if (shadowed || !Object.hasOwn(targetPackage.exports ?? {}, subpath))
          throw new Error(`Boundary violation: invalid shared support package export ${specifier}`)
        await verifyWorkspaceImport(path, targetPackage, subpath, options)
        continue
      }
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
        await verifyWorkspaceImport(path, targetPackage, subpath, options)
        continue
      }
      const resolved = ts.resolveModuleName(specifier, path, options, ts.sys).resolvedModule?.resolvedFileName
      const external = !specifier.startsWith('.') && !isAbsolute(specifier)
      const runtimeHost = external ? {...ts.sys, fileExists: (file: string) => !/\.[cm]?tsx?$/.test(file) && ts.sys.fileExists(file)} : ts.sys
      const implementation = runtime ? ts.resolveModuleName(specifier, path, {...options, noDtsResolution: true}, runtimeHost, undefined, undefined, mode ?? (/\.(?:cts|cjs)$/.test(path) ? ts.ModuleKind.CommonJS : ts.ModuleKind.ESNext)).resolvedModule?.resolvedFileName : undefined
      if (!resolved && !implementation) {
        if (specifier.startsWith('.') || isAbsolute(specifier)) throw new Error(`Boundary cannot resolve ${specifier} from ${path}`)
        if (Object.keys(options.paths ?? {}).some(pattern => {
          const [prefix, suffix] = pattern.split('*')
          return suffix === undefined ? specifier === prefix : specifier.startsWith(prefix) && specifier.endsWith(suffix)
        })) throw new Error(`Boundary cannot resolve configured alias ${specifier} from ${path}`)
        continue
      }
      for (const file of new Set([resolved, implementation].filter((item): item is string => item !== undefined))) {
        const target = await realpath(file)
        if (owner) {
          if (['tests', 'scripts', 'examples'].some(name => inside(resolve(base, name), target) || inside(resolve(owner.path, name), target)) ||
              owners.some(item => item !== owner && inside(item.path, target)))
            throw new Error(`Boundary violation: ${path} imports ${specifier}`)
        } else if (inside(support, path) && inside(base, target) && !inside(support, target) &&
            !inside(resolve(base, 'node_modules'), target) &&
            ![resolve(base, 'scripts/workspaces.mts'), resolve(base, 'scripts/workspaces.mjs')].includes(target)) {
          throw new Error(`Boundary violation: shared test support imports repository module ${specifier}`)
        }
      }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packages = (await packagesInOrder()).map(item => ({name: item.manifest.name, directory: item.directory,
    dependencies: item.manifest.dependencies, peerDependencies: item.manifest.peerDependencies, exports: item.manifest.exports}))
  await checkBoundaries(workspaceRoot, packages)
}
