import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash, type BinaryLike} from 'node:crypto'
import type {ModelIssue} from '../../../packages/validator/src/metadata/models/issues.js'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {build} from 'esbuild'
import {chromium, firefox, webkit} from 'playwright'
import {serve, root} from '../../../scripts/http/server.mjs'
import {selectedEngines} from '../../support/selection.mjs'

type UrlCase = {name: string; input: unknown; expected: {value?: unknown; errors: ModelIssue[]}}
type Row = {name: string; actual: {value?: unknown; errors: ModelIssue[]}}
type Failure = {name: string; expected: UrlCase['expected']; actual: Row['actual']; message: string}
type EngineReport = {engine: string; version: string; total: number; passed: number; failed: number; actual_executed_case_names: string[]; requested: string[]; unexpected: string[]; pageErrors: string[]; failures: Failure[]}

const selection = selectedEngines({chromium, firefox, webkit})
const sha256 = (value: BinaryLike) => createHash('sha256').update(value).digest('hex')
const expectedPath = resolve(root, 'tests/parity/expected/url-cases.json')
const expectedBytes = await readFile(expectedPath)
const cases = JSON.parse(expectedBytes.toString('utf8')) as UrlCase[]
// These generated lengths have independent pinned Pydantic captures. Keep them
// compact here while checking both path bytes and bounded parser allocation.
cases.push(
  {name: 'file URL with a long slash run', input: 'file:' + '/'.repeat(32768) + 'tail',
    expected: {value: 'file:///tail', errors: []}},
  {name: 'file URL with a long first segment', input: 'file:' + 'a'.repeat(32768),
    expected: {value: 'file:///' + 'a'.repeat(32768), errors: []}},
)
assert.equal(new Set(cases.map(item => item.name)).size, cases.length, 'Duplicate URL case identity')
const directory = resolve(root, 'artifacts/browser/url-models')
await mkdir(directory, {recursive: true})
await mkdir(resolve(root, 'artifacts/reports'), {recursive: true})
const bundle = resolve(directory, 'model.js')
const built = await build({absWorkingDir: root,
  entryPoints: ['packages/validator/src/metadata/models/urls.ts'],
  outfile: bundle, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', metafile: true})
const sourceFiles = Object.fromEntries(await Promise.all(Object.keys(built.metafile.inputs).sort()
  .map(async path => [path, sha256(await readFile(resolve(root, path)))])))
const report = {source_sha: execFileSync('git', ['rev-parse', 'HEAD'],
  {cwd: root, encoding: 'utf8', timeout: 5000}).trim(),
  test_sha256: sha256(await readFile(new URL(import.meta.url))),
  source_files_sha256: sourceFiles, bundle_sha256: sha256(await readFile(bundle)),
  expected_sha256: sha256(expectedBytes), selected_engines: selection.map(([name]) => name),
  maintained_cases: cases.length - 2, generated_cases: 2, reports: [] as EngineReport[]}
const host = await serve(directory)
const pagePath = '/url-model-controls', bundlePath = '/model.js'
try {
  for (const [name, engine] of selection) {
    const browser = await engine.launch({headless: true})
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      const context = await browser.newContext({serviceWorkers: 'block'})
      const requested: string[] = [], unexpected: string[] = [], pageErrors: string[] = []
      await context.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.origin !== host.origin || ![pagePath, bundlePath].includes(url.pathname)) {
          unexpected.push(url.href)
          return route.abort()
        }
        requested.push(url.pathname)
        if (url.pathname === pagePath) return route.fulfill({contentType: 'text/html',
          body: '<!doctype html><title>Metadata URL controls</title>'})
        return route.continue()
      })
      const page = await context.newPage()
      page.on('pageerror', error => pageErrors.push(error.message))
      await page.goto(host.origin + pagePath)
      const rows = await Promise.race([
        page.evaluate(async cases => {
          const modelPath = '/model.js'
          const {parseURL}: typeof import('../../../packages/validator/src/metadata/models/urls.js') = await import(modelPath)
          return cases.map(item => {
            const errors: ModelIssue[] = []
            const value = parseURL(item.input, [], errors)
            return {name: item.name, actual: errors.length ? {errors} : {value, errors}}
          })
        }, cases),
        new Promise<never>((_, reject) => {deadline = setTimeout(() =>
          reject(new Error('Browser URL model controls exceeded 60 seconds: ' + name)), 60000)}),
      ])
      const failures: Failure[] = []
      assert.deepEqual(rows.map(row => row.name), cases.map(item => item.name))
      for (let index = 0; index < cases.length; index++) {
        try {assert.deepEqual(rows[index].actual, cases[index].expected, cases[index].name)}
        catch (error) {failures.push({name: cases[index].name, expected: cases[index].expected,
          actual: rows[index].actual, message: (error as Error).message})}
      }
      report.reports.push({engine: name, version: browser.version(), total: rows.length,
        passed: rows.length - failures.length, failed: failures.length,
        actual_executed_case_names: rows.map(row => row.name), requested: [...new Set(requested)],
        unexpected, pageErrors, failures})
      assert.ok(requested.includes(bundlePath), 'The bundled URL model was not requested')
      assert.deepEqual(unexpected, [])
      assert.deepEqual(pageErrors, [])
      assert.equal(failures.length, 0, JSON.stringify(failures))
    } finally {clearTimeout(deadline); await browser.close()}
  }
} finally {
  await host.close()
  await writeFile(resolve(root, 'artifacts/reports/browser-url-models.json'), JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify({source_sha: report.source_sha,
  reports: report.reports.map(({engine, version, total, passed, failed}) => ({engine, version, total, passed, failed}))}))
