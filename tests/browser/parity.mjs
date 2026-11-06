import assert from 'node:assert/strict'
import {readFile, writeFile, mkdir} from 'node:fs/promises'
import {chromium, firefox, webkit} from 'playwright'
import {makeCases} from '../parity/cases.mjs'
import {compareResult} from '../parity/compare.mjs'
import {serve, root} from './host.mjs'

const cases = await makeCases()
const oracle = JSON.parse(await readFile(new URL('../parity/expected/crates.json', import.meta.url), 'utf8'))
const expected = new Map(oracle.cases.map(item => [item.name, item]))
assert.equal(expected.size, cases.length)
const host = await serve()
const reports = []
try {
  for (const [name, engine] of Object.entries({chromium, firefox, webkit})) {
    const browser = await engine.launch({headless: true})
    try {
      const context = await browser.newContext({serviceWorkers: 'block'})
      const unexpected = [], pageErrors = []
      await context.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.origin !== host.origin || !/^\/(?:examples\/submission\/|packages\/(?:core|validator)\/dist\/)/.test(url.pathname)) {
          unexpected.push(url.href)
          return route.abort()
        }
        return route.continue()
      })
      const page = await context.newPage()
      page.on('pageerror', error => pageErrors.push(error.message))
      await page.goto(host.origin + '/examples/submission/index.html')
      const started = performance.now()
      const results = await page.evaluate(async cases => {
        const worker = new Worker('../../packages/validator/dist/worker.js', {type: 'module'})
        const results = []
        try {
          for (const [id, item] of cases.entries()) {
            const result = await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('Worker case exceeded budget: ' + item.name)), 60000)
              worker.onmessage = ({data}) => {clearTimeout(timeout); resolve(data.result)}
              worker.onerror = event => {clearTimeout(timeout); reject(new Error(event.message))}
              worker.postMessage({session: 'parity-corpus', revision: id, id,
                files: new Map(Object.entries(item.files).map(([path, value]) =>
                  [path, Array.isArray(value) ? new Uint8Array(value) : value]))})
            })
            results.push({name: item.name, result})
          }
          return results
        } finally {worker.terminate()}
      }, cases)
      const failures = []
      for (const item of results) {
        try {compareResult(item.result, expected.get(item.name), item.name)}
        catch (error) {failures.push({name: item.name, message: error.message, actual: item.result})}
      }
      assert.equal(results.length, cases.length)
      const report = {engine: name, version: browser.version(), total: cases.length,
        passed: cases.length - failures.length, failures, unexpected, pageErrors,
        elapsed_ms: performance.now() - started}
      reports.push(report)
      console.log(JSON.stringify(report))
      assert.deepEqual(failures, [])
      assert.deepEqual(unexpected, [])
      assert.deepEqual(pageErrors, [])
    } finally {await browser.close()}
  }
} finally {
  await host.close()
  await mkdir(root + '/artifacts/reports', {recursive: true})
  await writeFile(root + '/artifacts/reports/browser-parity.json', JSON.stringify({reference: oracle.commit, reports}, null, 2) + '\n')
}
