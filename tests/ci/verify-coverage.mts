import assert from 'node:assert/strict'
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {resolve} from 'node:path'
import {makeCases} from '../parity/cases.mjs'
import {verifyCoverage} from '../support/coverage.mjs'
import {assertBrowserBindings} from '../browser/support/bindings.mjs'
import type {SelectionReceipt} from '../support/selection.mjs'
import {cases as literalGrammar} from '../reference/literal-grammar/checks.mjs'
import {cases as jsonldProcessing} from '../reference/jsonld-processing/checks.mjs'
import {cases as inferredCollections} from '../reference/inferred-collections/checks.mjs'
import {cases as collectionDiagnostics} from '../reference/collection-diagnostics/checks.mjs'

type CoverageRow = {selection?: SelectionReceipt | null; engine?: string; actual_executed_case_names: string[]; total: number; passed: number; failed?: number | null; failures?: unknown[] | null; unexpected?: unknown[] | null; pageErrors?: unknown[] | null}
type CoverageDocument = CoverageRow & {distribution: string; mode?: string; node_version?: string; reports?: CoverageRow[] | null}

const [kind, directory, count] = process.argv.slice(2)
assert.ok(['oracle', 'browser'].includes(kind), 'Expected oracle or browser coverage')
const shards = Number(count)
assert.ok(Number.isInteger(shards) && shards > 0 && shards <= 64)
const source = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim()
const documents: CoverageDocument[] = []
async function collect(path: string) {
  for (const entry of await readdir(path, {withFileTypes: true})) {
    const child = resolve(path, entry.name)
    if (entry.isDirectory()) await collect(child)
    else if (entry.name.endsWith('.json')) documents.push(JSON.parse(await readFile(child, 'utf8')) as CoverageDocument)
  }
}
await collect(resolve(directory))
if (kind === 'browser') for (const document of documents) assertBrowserBindings(document)
const all = await makeCases()
const receipts: Array<ReturnType<typeof verifyCoverage> & {distribution?: string; engine?: string}> = []
if (kind === 'oracle') {
  const reports = documents.filter(item => item.selection?.suite === 'crate-parity')
  for (const report of reports) {
    assert.equal(report.mode, 'live', 'Reference coverage requires fresh Python execution')
    assert.equal(report.distribution, 'source')
    assert.equal(report.node_version, '24.3.0')
  }
  receipts.push(verifyCoverage(all, reports, {suite: 'crate-parity', source, shards}))
} else {
  const explicit: Array<{name: string}> = []
  for (const name of (await readdir(new URL('../parity/inputs/', import.meta.url))).sort())
    explicit.push(...(JSON.parse(await readFile(new URL('../parity/inputs/' + name, import.meta.url), 'utf8')) as {cases: Array<{name: string}>}).cases)
  explicit.push(...all.filter(item => item.name.startsWith('manifest/inference-chunks/')))
  const reports = documents.flatMap(item => (item.reports ?? []).filter((row): row is CoverageRow & {selection: SelectionReceipt} => Boolean(row.selection))
    .map(row => ({...row, distribution: item.distribution})))
  const suites: Array<[string, readonly {name: string}[]]> = [['browser-parity', all], ['session-continuation', explicit],
    ['literal-grammar', literalGrammar], ['jsonld-processing', jsonldProcessing],
    ['inferred-collections', inferredCollections], ['collection-diagnostics', collectionDiagnostics]]
  assert.equal(reports.length, suites.length * 2 * 3 * shards, 'Missing or unexpected browser coverage reports')
  for (const distribution of ['source', 'installed']) {
    for (const engine of ['chromium', 'firefox', 'webkit']) {
      for (const [suite, cases] of suites) {
        const group = reports.filter(report => report.distribution === distribution &&
          report.engine === engine && report.selection.suite === suite)
        receipts.push({distribution, engine,
          ...verifyCoverage(cases, group, {suite, source, shards})})
      }
    }
  }
}
await mkdir('artifacts/reports', {recursive: true})
await writeFile('artifacts/reports/' + kind + '-coverage.json', JSON.stringify(receipts, null, 2) + '\n')
console.log(JSON.stringify(receipts, null, 2))
