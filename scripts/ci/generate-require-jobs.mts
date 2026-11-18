import assert from 'node:assert/strict'
import {readFile, writeFile} from 'node:fs/promises'
import ts from 'typescript'

const mode = process.argv[2]
assert.ok(process.argv.length === 3 && (mode === '--write' || mode === '--check'), 'Expected --write or --check')
const source = new URL('./require-jobs.mts', import.meta.url)
const output = new URL('./require-jobs.mjs', import.meta.url)
const input = await readFile(source, 'utf8')
const result = ts.transpileModule(input, {
  fileName: 'require-jobs.mts',
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext},
})
const generated = '// Generated from scripts/ci/require-jobs.mts by npm run generate:admission; do not edit.\n' + result.outputText
if (mode === '--write') await writeFile(output, generated)
else assert.equal(await readFile(output, 'utf8'), generated, 'Run npm run generate:admission to refresh the required-jobs entry')
