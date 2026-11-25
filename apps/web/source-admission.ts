import {readdir, readFile, realpath} from 'node:fs/promises'
import {dirname, isAbsolute, relative, resolve, sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {parse as parseAstro} from '@astrojs/compiler-rs'
import {parse as parseVue} from 'vue/compiler-sfc'
import ts from 'typescript'

function inside(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep))
}

async function registeredSources(directory: string, solution: string): Promise<Set<string>> {
  const visited = new Set<string>()
  const covered = new Set<string>()
  async function visit(project: string): Promise<void> {
    const path = await realpath(ts.resolveProjectReferencePath({path: project}))
    if (visited.has(path)) return
    visited.add(path)
    const config = ts.readJsonConfigFile(path, ts.sys.readFile)
    const parsed = ts.parseJsonSourceFileConfigFileContent(config, ts.sys, dirname(path), undefined, path)
    if (parsed.errors.length) throw new Error('Invalid compiler project: ' + path + ': ' + ts.flattenDiagnosticMessageText(parsed.errors[0].messageText, '\n'))
    for (const reference of parsed.projectReferences ?? []) await visit(reference.path)
    if (!inside(directory, path) || !parsed.fileNames.length) return
    const strictOptions = ['noImplicitAny', 'strictNullChecks', 'strictFunctionTypes', 'strictBindCallApply',
      'strictPropertyInitialization', 'strictBuiltinIteratorReturn', 'noImplicitThis', 'useUnknownInCatchVariables', 'alwaysStrict'] as const
    if (parsed.options.strict !== true || parsed.options.noCheck || strictOptions.some(option => parsed.options[option] === false))
      throw new Error('App compiler project must enable strict typechecking: ' + path)
    const program = ts.createProgram(parsed.fileNames, {...parsed.options, noEmit: true})
    for (const source of program.getSourceFiles()) covered.add(await realpath(source.fileName))
  }
  await visit(solution)
  return covered
}

function checkTypecheckDirective(source: string, path: string): void {
  const comments = ts.getLeadingCommentRanges(source, 0) ?? []
  if (comments.some(comment => comment.kind === ts.SyntaxKind.SingleLineCommentTrivia &&
      /^\/\/\/?\s*@ts-nocheck\b/.test(source.slice(comment.pos, comment.end))))
    throw new Error('App source disables typechecking: ' + path)
}

function checkAstro(source: string, path: string): void {
  const result = parseAstro(source)
  if (result.diagnostics.length) throw new Error('Invalid Astro component: ' + path)
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {for (const child of value) visit(child); return}
    const node = value as Record<string, unknown>
    if ((node.type === 'AstroScript' || node.type === 'AstroFrontmatter') && typeof node.start === 'number' && typeof node.end === 'number') {
      const start = node.type === 'AstroScript' ? source.indexOf('>', node.start) + 1 : node.start + 3
      if (start > node.start) checkTypecheckDirective(source.slice(start, node.end), path)
    }
    if (node.type === 'JSXOpeningElement') {
      const name = node.name as {type?: unknown; name?: unknown} | undefined
      if (name?.type === 'JSXIdentifier' && name.name === 'script' && Array.isArray(node.attributes) && node.attributes.length)
        throw new Error('Astro script must be processed and typechecked: ' + path)
    }
    for (const child of Object.values(node)) visit(child)
  }
  visit(result.ast)
}

export async function checkSources(directory: string, solution = resolve(directory, '../../tsconfig.json')): Promise<void> {
  const authored: string[] = []
  async function scan(current: string): Promise<void> {
    for (const entry of await readdir(current, {withFileTypes: true})) {
      if (entry.name === 'node_modules') continue
      const path = resolve(current, entry.name)
      if (entry.isSymbolicLink()) throw new Error('App source must not be a symlink: ' + path)
      if (entry.isDirectory()) await scan(path)
      else if (/\.(?:js|jsx|mjs|cjs)$/.test(entry.name)) throw new Error('JavaScript app source is not admitted: ' + path)
      else if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) {
        checkTypecheckDirective(await readFile(path, 'utf8'), path)
        authored.push(path)
      }
      else if (entry.name.endsWith('.vue')) {
        const result = parseVue(await readFile(path, 'utf8'), {filename: path})
        if (result.errors.length) throw new Error('Invalid Vue component: ' + path)
        for (const script of [result.descriptor.script, result.descriptor.scriptSetup])
          if (script) {
            if (script.lang !== 'ts') throw new Error('Vue script must use TypeScript: ' + path)
            checkTypecheckDirective(script.content, path)
          }
      } else if (entry.name.endsWith('.astro')) checkAstro(await readFile(path, 'utf8'), path)
    }
  }
  await scan(directory)
  if (authored.length) {
    const covered = await registeredSources(await realpath(directory), solution)
    for (const path of authored) if (!covered.has(await realpath(path)))
      throw new Error('Unregistered authored TypeScript: ' + path)
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkSources(fileURLToPath(new URL('.', import.meta.url)))
