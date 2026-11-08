import {selectCases, selectedEngines} from '../ci/selection.mjs'
import {assertBrowserBindings} from '../ci/browser-bindings.mjs'
import {bindSessionCore} from './session/module-bindings.mjs'
import assert from 'node:assert/strict'
import {readFile, readdir, writeFile} from 'node:fs/promises'
import {chromium, firefox, webkit} from 'playwright'
import {createHash} from 'node:crypto'
import {makeCases} from '../parity/cases.mjs'
import {compareResult} from '../parity/compare.mjs'
import {assertInputBytes} from '../parity/inputs.mjs'
import {serve, root} from './host.mjs'

const inputs = new URL('../parity/inputs/', import.meta.url)
const allCases = []
for (const filename of (await readdir(inputs)).sort())
  allCases.push(...JSON.parse(await readFile(new URL(filename, inputs))).cases)
const oracle = JSON.parse(await readFile(new URL('../parity/expected/crates.json', import.meta.url)))
const fullCorpus = await makeCases()
assert.equal(oracle.corpus_sha256, createHash('sha256').update(JSON.stringify(fullCorpus)).digest('hex'))
const fixtureHash = createHash('sha256').update(JSON.stringify(allCases)).digest('hex')
const expected = new Map(oracle.cases.map(c => [c.name, c]))
assert.equal(expected.size, fullCorpus.length)
assert.equal(new Set(fullCorpus.map(item => item.name)).size, fullCorpus.length)
for (const item of fullCorpus) assertInputBytes(item, expected.get(item.name))
assert.equal(new Set(allCases.map(item => item.name)).size, allCases.length)
for (const item of allCases) assertInputBytes(item, expected.get(item.name))
const {cases, receipt: selection} = selectCases(allCases, {suite: 'session-continuation'})
assert.deepEqual(cases.map(item => item.name), selection.case_names)
const browserPath = process.env.BIJUX_BROWSER_SESSION_PATH ?? '/packages/validator/dist/browser.js'
const workerPath = process.env.BIJUX_BROWSER_WORKER_PATH ?? '/packages/validator/dist/worker.js'
const corePath = process.env.BIJUX_BROWSER_CORE_PATH ?? '/packages/core/dist/index.js'
const distribution = process.env.BIJUX_BROWSER_SESSION_PATH ? 'installed' : 'source'
if (distribution === 'installed') assert.ok(process.env.BIJUX_BROWSER_CORE_PATH, 'Installed Session controls require their installed core path')
assertBrowserBindings({distribution, browserPath, workerPath, corePath}, 'session-continuation')
const host = await serve(), reports = []
try {
  for (const [engineName, engine] of selectedEngines({chromium, firefox, webkit})) {
    const browser = await engine.launch({headless: true})
    try {
      const page = await browser.newPage()
      const unexpected = [], pageErrors = [], coreRequests = []
      page.on('pageerror', error => pageErrors.push(error.message))
      await page.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.pathname === corePath) coreRequests.push(url.pathname)
        if (url.origin !== host.origin || (distribution === 'installed' && url.pathname.startsWith('/packages/core/'))) {unexpected.push(url.href); return route.abort()}
        return route.continue()
      })
      await bindSessionCore(page, host.origin, corePath)
      await page.goto(host.origin + '/examples/submission/index.html')
      const results = await page.evaluate(async ({cases, browserPath, workerPath}) => {
        const {ValidationSession} = await import(browserPath)
        const results = []
        for (const item of cases) {
          const session = new ValidationSession({debounceMs: 0,
            workerFactory: () => new Worker(workerPath, {type: 'module'})})
          let deadline, unsubscribe
          try {
            const ready = new Promise((resolve, reject) => {
              deadline = setTimeout(() => reject(new Error('Continuation case exceeded budget: ' + item.name)), 60000)
              unsubscribe = session.subscribe(snapshot => {
                if (['valid', 'invalid', 'incomplete'].includes(snapshot.state)) resolve(snapshot)
              })
            })
            session.select(new Map(Object.entries(item.files).map(([path, value]) =>
              [path, Array.isArray(value) ? new Uint8Array(value) : value])),
            {contexts: new Map(Object.entries(item.contexts ?? {}))})
            const snapshot = await ready
            clearTimeout(deadline)
            let refused = false, handoff
            try {handoff = session.continue()} catch {refused = true}
            const hashes = {}
            if (handoff) for (const [path, value] of handoff.files) {
              const bytes = typeof value === 'string' ? new TextEncoder().encode(value) :
                value instanceof Blob ? await value.arrayBuffer() : value
              const hash = await crypto.subtle.digest('SHA-256', bytes)
              hashes[path] = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
            }
            results.push({name: item.name, result: snapshot.result, eligible: snapshot.eligible,
              refused, inputs_sha256: hashes, contexts: handoff ? Object.fromEntries(handoff.options.contexts) : null})
          } finally {clearTimeout(deadline); unsubscribe?.(); session.dispose()}
        }
        return results
      }, {cases, browserPath, workerPath})
      for (const row of results) {
        const wanted = expected.get(row.name), item = cases.find(c => c.name === row.name)
        compareResult(row.result, wanted, row.name)
        assert.equal(row.eligible, wanted.status === 'valid', row.name)
        assert.equal(row.refused, wanted.status !== 'valid', row.name)
        if (row.eligible) {
          assert.deepEqual(row.inputs_sha256, wanted.inputs_sha256, row.name)
          assert.deepEqual(row.contexts, item.contexts ?? {}, row.name)
        }
      }
      assert.equal(results.length, cases.length)
      const actualExecutedCaseNames = results.map(item => item.name)
      assert.deepEqual(actualExecutedCaseNames, selection.case_names)
      assert.ok(coreRequests.includes(corePath), 'Selected core module was not requested')
      assert.deepEqual(unexpected, [])
      assert.deepEqual(pageErrors, [])
      reports.push({engine: engineName, version: browser.version(), total: cases.length,
        selection, actual_executed_case_names: actualExecutedCaseNames,
        passed: results.length, invalid_continuation_refused: results.filter(r => r.refused).length,
        valid_byte_handoffs: results.filter(r => r.eligible).length, unexpected, pageErrors, coreRequests})
    } finally {await browser.close()}
  }
} finally {await host.close()}
const report = {distribution, reference: oracle.commit, corpus_sha256: oracle.corpus_sha256,
  fixture_sha256: fixtureHash, browserPath, workerPath, corePath, reports}
await writeFile(root + '/artifacts/reports/' + distribution + '-continuation-parity.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
