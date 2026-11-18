import assert from 'node:assert/strict'
import {readFile, writeFile} from 'node:fs/promises'
import ts from 'typescript'

const mode = process.argv[2]
const selection = process.argv[3]
assert.ok((mode === '--write' || mode === '--check') && process.argv.length <= 4 && (selection === undefined || selection === 'admission'), 'Expected --write or --check, optionally followed by admission')
const entries = [
  {name: 'admission', path: 'ci/require-jobs', command: 'generate:admission'},
  {name: 'parity', path: 'parity', command: 'generate:runtime'},
]
for (const entry of entries) {
  if (selection !== undefined && selection !== entry.name) continue
  const source = new URL('./' + entry.path + '.mts', import.meta.url)
  const output = new URL('./' + entry.path + '.mjs', import.meta.url)
  const input = await readFile(source, 'utf8')
  const result = ts.transpileModule(input, {
    fileName: entry.path + '.mts',
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext},
  })
  const generated = `// Generated from scripts/${entry.path}.mts by npm run ${entry.command}; do not edit.\n` + result.outputText
  if (mode === '--write') await writeFile(output, generated)
  else assert.equal(await readFile(output, 'utf8'), generated, 'Run npm run ' + entry.command + ' to refresh ' + entry.path)
}
