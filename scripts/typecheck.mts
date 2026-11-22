import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'
import {fileURLToPath} from 'node:url'
import {readFile, readdir, realpath, stat} from 'node:fs/promises'
import {dirname, isAbsolute, relative, resolve, sep} from 'node:path'
import ts from 'typescript'
import {isPackageCompilerProject, packagesInOrder, root} from './workspaces.mjs'

const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url))
async function filesUnder(directory: string, owner: string, ancestors = new Set<string>()): Promise<string[]> {
  const actual = await realpath(directory)
  const difference = relative(owner, actual)
  if (isAbsolute(difference) || difference === '..' || difference.startsWith('..' + sep))
    throw new Error('Package symlink escapes package: ' + directory)
  if (ancestors.has(actual)) throw new Error('Package symlink cycle: ' + directory)
  const parents = new Set(ancestors).add(actual)
  const entries = await readdir(directory, {withFileTypes: true})
  const files: string[] = []
  for (const entry of entries) {
    if ((entry.name === 'dist' && actual === owner) || entry.name === 'node_modules') continue
    const path = resolve(directory, entry.name)
    if (entry.isSymbolicLink()) {
      const target = await realpath(path)
      const difference = relative(owner, target)
      if (isAbsolute(difference) || difference === '..' || difference.startsWith('..' + sep))
        throw new Error('Package symlink escapes package: ' + path)
      const type = await stat(path)
      if (type.isDirectory()) files.push(...await filesUnder(path, owner, parents))
      else if (type.isFile()) files.push(path)
    } else if (entry.isDirectory()) files.push(...await filesUnder(path, owner, parents))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

const strictOptions = ['noImplicitAny', 'strictNullChecks', 'strictFunctionTypes', 'strictBindCallApply',
  'strictPropertyInitialization', 'strictBuiltinIteratorReturn', 'noImplicitThis', 'useUnknownInCatchVariables', 'alwaysStrict'] as const
const projects: string[] = []
for (const item of await packagesInOrder()) {
  if (item.manifest.private) continue
  const directory = fileURLToPath(item.path)
  const registered = new Set(item.manifest.bijux.typecheck.map(path => resolve(directory, path)))
  if (!registered.has(resolve(directory, item.manifest.bijux.declarations)))
    throw new Error('Declaration compiler project is not registered: ' + item.manifest.name)
  const owner = await realpath(directory)
  const authored = await filesUnder(directory, owner)
  const sourceDirectory = resolve(directory, 'src')
  for (const path of authored) {
    if (!/\.(?:js|mjs|cjs|jsx)$/i.test(path)) continue
    const sourcePath = relative(sourceDirectory, path)
    const inSource = !isAbsolute(sourcePath) && sourcePath !== '..' && !sourcePath.startsWith('..' + sep)
    const parts = relative(directory, path).split(sep)
    const fixture = parts[0] === 'tests' && parts.slice(1, -1).includes('fixtures')
    if (inSource) throw new Error('JavaScript package source: ' + path)
    if (!fixture) throw new Error('JavaScript package implementation: ' + path)
  }
  const entries = authored.filter(path => {
    const sourcePath = relative(sourceDirectory, path)
    return !isAbsolute(sourcePath) && sourcePath !== '..' && !sourcePath.startsWith('..' + sep) &&
      /\.(?:ts|tsx|mts|cts)$/.test(path) && !/\.d\.(?:ts|mts|cts)$/.test(path)
  })
  // Check statically resolved runtime inputs; fixture data and generated dist remain separate.
  const runtime = await build({absWorkingDir: directory, entryPoints: entries,
    outdir: resolve(root, 'artifacts/typescript-runtime', item.directory), entryNames: '[dir]/[name]-[hash]',
    bundle: true, write: false, metafile: true, platform: 'browser', packages: 'external', external: ['node:*'], logLevel: 'silent'})
  for (const input of Object.keys(runtime.metafile.inputs)) {
    if (input.startsWith('<data:')) {
      // Esbuild has already parsed the payload with its JSON loader.
      if (/^<data:application\/json(?:;[^,]*)?,/i.test(input)) continue
      throw new Error('Unverified JavaScript runtime dependency: ' + input)
    }
    if (/\.(?:js|mjs|cjs|jsx)$/i.test(input))
      throw new Error('Unverified JavaScript runtime dependency: ' + resolve(directory, input))
  }
  const registeredReal = new Set(await Promise.all([...registered].map(path => realpath(path))))
  const covered = new Set<string>()
  const coveredReal = new Set<string>()
  const inherited = new Set<string>()
  for (const project of registered) {
    const config = ts.readJsonConfigFile(project, ts.sys.readFile)
    const parsed = ts.parseJsonSourceFileConfigFileContent(config, ts.sys, dirname(project), undefined, project)
    for (const path of config.extendedSourceFiles ?? []) {
      inherited.add(resolve(path))
      inherited.add(await realpath(path))
    }
    if (parsed.errors.length) throw new Error(ts.flattenDiagnosticMessageText(parsed.errors[0].messageText, '\n'))
    if (project === resolve(directory, item.manifest.bijux.declarations) && parsed.options.allowJs)
      throw new Error('Package declaration project must not enable allowJs: ' + project)
    if (parsed.options.noCheck || parsed.options.skipLibCheck || parsed.options.strict !== true ||
        strictOptions.some(option => parsed.options[option] === false))
      throw new Error('Package compiler project must enable strict typechecking: ' + project)
    const program = ts.createProgram(parsed.fileNames, {...parsed.options, noEmit: true})
    for (const source of program.getSourceFiles()) {
      const file = resolve(source.fileName)
      covered.add(file)
      const difference = relative(directory, file)
      if (!isAbsolute(difference) && difference !== '..' && !difference.startsWith('..' + sep)) coveredReal.add(await realpath(file))
    }
    projects.push(project)
  }
  for (const path of authored.filter(isPackageCompilerProject)) {
    if (registered.has(path) || registeredReal.has(await realpath(path))) continue
    const config = ts.readConfigFile(path, ts.sys.readFile)
    const value: unknown = config.config
    const alias = value && typeof value === 'object' && Object.keys(value).length === 1 &&
      'extends' in value && typeof value.extends === 'string' && registered.has(resolve(dirname(path), value.extends))
    const configOnly = value && typeof value === 'object' && (inherited.has(path) || inherited.has(await realpath(path))) &&
      Object.entries(value).every(([key, entry]) => !['files', 'include', 'references'].includes(key) ||
        (Array.isArray(entry) && entry.length === 0))
    if (!alias && !configOnly) throw new Error('Unregistered compiler project: ' + path)
  }
  for (const path of authored.filter(path => /\.(?:ts|tsx|mts|cts)$/.test(path))) {
    const content = await readFile(path, 'utf8')
    const comments = ts.getLeadingCommentRanges(content, 0) ?? []
    if (comments.some(comment => comment.kind === ts.SyntaxKind.SingleLineCommentTrivia &&
        /^\/\/\/?\s*@ts-nocheck\b/.test(content.slice(comment.pos, comment.end))))
      throw new Error('Package source disables typechecking: ' + path)
    if (!covered.has(path) && !coveredReal.has(await realpath(path)))
      throw new Error('Unregistered authored TypeScript: ' + path)
  }
}

for (const project of [...projects, 'tests/types/tsconfig.validator-entry.json', 'tests/types/tsconfig.node.json', 'tests/types/tsconfig.browser.json', 'tests/package/tsconfig.consumers.json', 'tests/package/fixtures/core/tsconfig.json', 'tests/package/fixtures/validator/tsconfig.json', 'tests/package/fixtures/workspace/tsconfig.json', 'tests/ci/tsconfig.tests.json', 'tests/tooling/tsconfig.tests.json', 'tests/browser/tsconfig.tests.json', 'tests/browser/tsconfig.harness.json', 'tests/browser/tsconfig.worker.json', 'examples/submission/tsconfig.json', 'tests/standards/tsconfig.tests.json', 'tsconfig.tooling.json']) {
  const source = spawnSync(process.execPath, [compiler, '-p', project, '--noEmit'], {stdio: 'inherit'})
  if (source.status !== 0) process.exit(source.status ?? 1)
}
const runtimeGenerator = fileURLToPath(new URL('./generate-runtime-entries.mts', import.meta.url))
const generatedRuntime = spawnSync(process.execPath, ['--import', 'tsx', runtimeGenerator, '--check'], {stdio: 'inherit'})
if (generatedRuntime.status !== 0) process.exit(generatedRuntime.status ?? 1)
console.log('Node-only and browser public declarations pass independently')
