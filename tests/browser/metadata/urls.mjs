import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {build} from 'esbuild'
import {chromium, firefox, webkit} from 'playwright'
import {serve, root} from '../host.mjs'
import {selectedEngines} from '../../ci/selection.mjs'

const selection = selectedEngines({chromium, firefox, webkit})
const sha256 = value => createHash('sha256').update(value).digest('hex')
const expectedPath = resolve(root, 'tests/parity/expected/url-cases.json')
const expectedBytes = await readFile(expectedPath)
const cases = JSON.parse(expectedBytes)
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
  entryPoints: ['packages/validator/src/metadata/models/urls.js'],
  outfile: bundle, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', metafile: true})
const sourceFiles = Object.fromEntries(await Promise.all(Object.keys(built.metafile.inputs).sort()
  .map(async path => [path, sha256(await readFile(resolve(root, path)))])))
const report = {source_sha: execFileSync('git', ['rev-parse', 'HEAD'],
  {cwd: root, encoding: 'utf8', timeout: 5000}).trim(),
  test_sha256: sha256(await readFile(new URL(import.meta.url))),
  source_files_sha256: sourceFiles, bundle_sha256: sha256(await readFile(bundle)),
  expected_sha256: sha256(expectedBytes), selected_engines: selection.map(([name]) => name),
  maintained_cases: cases.length - 2, generated_cases: 2, reports: []}
const host = await serve(directory)
const pagePath = '/url-model-controls', bundlePath = '/model.js'
try {
  for (const [name, engine] of selection) {
    const browser = await engine.launch({headless: true})
    let deadline
    try {
      const context = await browser.newContext({serviceWorkers: 'block'})
      const requested = [], unexpected = [], pageErrors = []
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
          const {parseURL} = await import('/model.js')
          return cases.map(item => {
            const errors = []
            const value = parseURL(item.input, [], errors)
            return {name: item.name, actual: errors.length ? {errors} : {value, errors}}
          })
        }, cases),
        new Promise((_, reject) => {deadline = setTimeout(() =>
          reject(new Error('Browser URL model controls exceeded 60 seconds: ' + name)), 60000)}),
      ])
      const failures = []
      assert.deepEqual(rows.map(row => row.name), cases.map(item => item.name))
      for (let index = 0; index < cases.length; index++) {
        try {assert.deepEqual(rows[index].actual, cases[index].expected, cases[index].name)}
        catch (error) {failures.push({name: cases[index].name, expected: cases[index].expected,
          actual: rows[index].actual, message: error.message})}
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
