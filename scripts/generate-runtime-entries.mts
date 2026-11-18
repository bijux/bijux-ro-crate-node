import assert from 'node:assert/strict'
import {readFile, writeFile} from 'node:fs/promises'
import ts from 'typescript'

const mode = process.argv[2]
const selection = process.argv[3]
assert.ok((mode === '--write' || mode === '--check') && process.argv.length <= 4 && (selection === undefined || selection === 'admission'), 'Expected --write or --check, optionally followed by admission')
const entries: Array<{name: string, path: string, command: string, sourceLabel?: string, outputExtension?: string}> = [
  {name: 'admission', path: 'ci/require-jobs', command: 'generate:admission'},
  {name: 'parity', path: 'parity', command: 'generate:runtime'},
  {name: 'workspaces', path: 'workspaces', command: 'generate:runtime'},
  {name: 'package-archive', path: 'release/pack', command: 'generate:runtime'},
  {name: 'package-build', path: 'build', command: 'generate:runtime'},
  {name: 'http-server', path: 'http/server', command: 'generate:runtime'},
  {name: 'http-example', path: 'http/example', command: 'generate:runtime'},
  {name: 'typecheck', path: 'typecheck', command: 'generate:runtime'},
  {name: 'test-discovery', path: 'test-discovery', command: 'generate:runtime'},
  {name: 'browser-checks', path: 'ci/browser-checks', command: 'generate:runtime'},
  {name: 'reference-execution', path: 'ci/reference-execution', command: 'generate:runtime'},
  {name: 'reference-checks', path: 'ci/reference-checks', command: 'generate:runtime'},
  {name: 'oracle-partitions', path: 'reference/oracle-partitions', command: 'generate:runtime'},
  {name: 'parity-inputs', path: '../tests/parity/inputs', sourceLabel: 'tests/parity/inputs.mts', command: 'generate:runtime'},
  {name: 'case-selection', path: '../tests/ci/selection', sourceLabel: 'tests/ci/selection.mts', command: 'generate:runtime'},
  {name: 'case-coverage', path: '../tests/ci/coverage', sourceLabel: 'tests/ci/coverage.mts', command: 'generate:runtime'},
  {name: 'text-file-cases', path: '../tests/inputs/text-files', sourceLabel: 'tests/inputs/text-files.mts', command: 'generate:runtime'},
  {name: 'file-path-cases', path: '../tests/inputs/file-paths', sourceLabel: 'tests/inputs/file-paths.mts', command: 'generate:runtime'},
  {name: 'browser-bindings', path: '../tests/ci/browser-bindings', sourceLabel: 'tests/ci/browser-bindings.mts', command: 'generate:runtime'},
  {name: 'corpus-dates', path: '../tests/parity/corpus/dates', sourceLabel: 'tests/parity/corpus/dates.mts', command: 'generate:runtime'},
  {name: 'corpus-integers', path: '../tests/parity/corpus/integers', sourceLabel: 'tests/parity/corpus/integers.mts', command: 'generate:runtime'},
  {name: 'corpus-nonfinite', path: '../tests/parity/corpus/nonfinite', sourceLabel: 'tests/parity/corpus/nonfinite.mts', command: 'generate:runtime'},
  {name: 'corpus-datatypes', path: '../tests/parity/corpus/datatypes', sourceLabel: 'tests/parity/corpus/datatypes.mts', command: 'generate:runtime'},
  {name: 'corpus-manifest-records', path: '../tests/parity/corpus/manifest-records', sourceLabel: 'tests/parity/corpus/manifest-records.mts', command: 'generate:runtime'},
  {name: 'corpus-manifest-chunks', path: '../tests/parity/corpus/manifest-chunks', sourceLabel: 'tests/parity/corpus/manifest-chunks.mts', command: 'generate:runtime'},
  {name: 'corpus-ontology', path: '../tests/parity/corpus/ontology', sourceLabel: 'tests/parity/corpus/ontology.mts', command: 'generate:runtime'},
  {name: 'corpus-rdf-semantics', path: '../tests/parity/corpus/rdf-semantics', sourceLabel: 'tests/parity/corpus/rdf-semantics.mts', command: 'generate:runtime'},
  {name: 'corpus-jsonld', path: '../tests/parity/corpus/jsonld', sourceLabel: 'tests/parity/corpus/jsonld.mts', command: 'generate:runtime'},
  {name: 'corpus-collections', path: '../tests/parity/corpus/collections', sourceLabel: 'tests/parity/corpus/collections.mts', command: 'generate:runtime'},
  {name: 'parity-cases', path: '../tests/parity/cases', sourceLabel: 'tests/parity/cases.mts', command: 'generate:runtime'},
  {name: 'parity-tsv-cases', path: '../tests/parity/tsv-cases', sourceLabel: 'tests/parity/tsv-cases.mts', command: 'generate:runtime'},
  {name: 'parity-workload-cases', path: '../tests/parity/workload-cases', sourceLabel: 'tests/parity/workload-cases.mts', command: 'generate:runtime'},
  {name: 'parity-qualification', path: '../tests/parity/qualification', sourceLabel: 'tests/parity/qualification.mts', command: 'generate:runtime'},
  {name: 'reference-root-context-propagation-capture', path: '../tests/reference/root-context-propagation/verify-capture', sourceLabel: 'tests/reference/root-context-propagation/verify-capture.mts', command: 'generate:runtime'},
  {name: 'reference-manifest-inference-capture', path: '../tests/reference/manifest-inference/verify-capture', sourceLabel: 'tests/reference/manifest-inference/verify-capture.mts', command: 'generate:runtime'},
  {name: 'reference-key-equality-capture', path: '../tests/reference/key-equality/verify-capture', sourceLabel: 'tests/reference/key-equality/verify-capture.mts', command: 'generate:runtime'},
  {name: 'parity-normalization', path: '../tests/parity/normalize', sourceLabel: 'tests/parity/normalize.mts', command: 'generate:runtime'},
  {name: 'path-corpus', path: '../tests/parity/corpus/paths', sourceLabel: 'tests/parity/corpus/paths.mts', command: 'generate:runtime'},
  {name: 'url-corpus', path: '../tests/parity/corpus/urls', sourceLabel: 'tests/parity/corpus/urls.mts', command: 'generate:runtime'},
  {name: 'submission-editor', path: '../examples/submission/editor', sourceLabel: 'examples/submission/editor.mts', outputExtension: '.js', command: 'generate:runtime'},
  {name: 'parity-comparison', path: '../tests/parity/compare', sourceLabel: 'tests/parity/compare.mts', command: 'generate:runtime'},
]
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
