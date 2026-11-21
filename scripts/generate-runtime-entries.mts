import assert from 'node:assert/strict'
import {readFile, readdir, stat, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import ts from 'typescript'
import {entries, runtimeEntryPaths, typedOnlyPaths} from './runtime-entries.mts'

const mode = process.argv[2]
const selection = process.argv[3]
assert.ok((mode === '--write' || mode === '--check') && process.argv.length <= 4 && (selection === undefined || selection === 'admission'), 'Expected --write or --check, optionally followed by admission')
const typedOnly = new Set(typedOnlyPaths.map(path => fileURLToPath(new URL('./' + path, import.meta.url))))
const sources = new Set(entries.map(entry => fileURLToPath(new URL('./' + entry.path + '.mts', import.meta.url))))
const outputs = new Set(entries.map(entry => fileURLToPath(new URL('./' + entry.path + (entry.outputExtension ?? '.mjs'), import.meta.url))))
async function checkRegistrations(directory: string, scriptsDirectory: boolean): Promise<void> {
  let items
  try { items = await readdir(directory, {withFileTypes: true}) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
  for (const item of items) {
    const path = resolve(directory, item.name)
    if (item.isSymbolicLink()) {
      if (scriptsDirectory || /\.(?:mts|mjs|js|cjs)$/.test(item.name) || (await stat(path)).isDirectory())
        throw new Error('Unsupported runtime registration symlink: ' + path)
      continue
    }
    if (item.isDirectory()) { await checkRegistrations(path, scriptsDirectory); continue }
    if (!item.isFile()) continue
    if ((item.name.endsWith('.mts') || (scriptsDirectory && /(?<!\.d)\.(?:ts|tsx|cts)$/.test(item.name))) && !sources.has(path) && !typedOnly.has(path))
      throw new Error('Unregistered authored runtime entry: ' + path)
    if (/\.(?:mjs|js|cjs)$/.test(item.name) && !outputs.has(path)) {
      if ((await readFile(path, 'utf8')).startsWith('// Generated from '))
        throw new Error('Orphan generated runtime entry: ' + path)
      if (scriptsDirectory) throw new Error('Unregistered executable runtime entry: ' + path)
    }
  }
}
if (selection === undefined) {
  for (const directory of ['.', '../tests', '../examples'])
    await checkRegistrations(fileURLToPath(new URL(directory + '/', import.meta.url)), directory === '.')
}

for (const entry of entries) {
  if (selection !== undefined && selection !== entry.name) continue
  const source = new URL('./' + entry.path + '.mts', import.meta.url)
  const output = new URL('./' + entry.path + (entry.outputExtension ?? '.mjs'), import.meta.url)
  const input = await readFile(source, 'utf8')
  const result = ts.transpileModule(input, {
    fileName: entry.path + '.mts',
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext},
  })
  const generated = `// Generated from ${entry.sourceLabel ?? 'scripts/' + entry.path + '.mts'} by npm run ${entry.command}; do not edit.\n` + result.outputText
  if (mode === '--write') await writeFile(output, generated)
  else assert.equal(await readFile(output, 'utf8'), generated, 'Run npm run ' + entry.command + ' to refresh ' + entry.path)
}

if (selection === undefined) {
  const attributes = new URL('../.gitattributes', import.meta.url)
  const existing = await readFile(attributes, 'utf8')
  const begin = '# BEGIN generated runtime entries'
  const end = '# END generated runtime entries'
  const first = existing.indexOf(begin)
  const last = existing.indexOf(end)
  assert.ok(first >= 0 && last > first && existing.indexOf(begin, first + begin.length) < 0 && existing.indexOf(end, last + end.length) < 0, 'Invalid generated runtime attributes block')
  const paths = entries.map(entry => runtimeEntryPaths(entry).output).sort()
  assert.equal(new Set(paths).size, paths.length, 'Duplicate generated runtime output')
  const block = [begin, ...paths.map(path => '/' + path + ' linguist-generated=true'), end].join('\n')
  const updated = existing.slice(0, first) + block + existing.slice(last + end.length)
  if (mode === '--write') await writeFile(attributes, updated)
  else assert.equal(existing, updated, 'Generated runtime attributes are stale; run npm run generate:runtime')
}
