import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdir, writeFile} from 'node:fs/promises'
import {chromium, firefox, webkit} from 'playwright'
import {selectCases, selectedEngines, assertExecutedCases} from '../../ci/selection.mjs'
import {assertBrowserBindings} from '../../ci/browser-bindings.mjs'
import {serve, root} from '../host.mjs'

/** Qualify exact reference contracts and continuation through the owned Session. */
export async function runReferenceContracts(suite, contract) {
  const {cases, receipt: selection} = selectCases(contract.cases, {suite})
  const browserPath = process.env.BIJUX_BROWSER_SESSION_PATH ?? '/packages/validator/dist/browser.js'
  const workerPath = process.env.BIJUX_BROWSER_WORKER_PATH ?? '/packages/validator/dist/worker.js'
  const corePath = process.env.BIJUX_BROWSER_CORE_PATH ?? '/packages/core/dist/index.js'
  const distribution = process.env.BIJUX_BROWSER_SESSION_PATH ? 'installed' : 'source'
  assertBrowserBindings({distribution, browserPath, workerPath, corePath}, 'session-continuation')
  const pagePath = '/reference-contract-controls'
  const allowed = new Set([pagePath, browserPath, workerPath, corePath])
  const host = await serve(), reports = []
  try {
    for (const [engine, implementation] of selectedEngines({chromium, firefox, webkit})) {
      const browser = await implementation.launch({headless: true})
      try {
        const context = await browser.newContext({serviceWorkers: 'block'})
        const requested = [], unexpected = [], pageErrors = []
        await context.route('**/*', route => {
          const url = new URL(route.request().url())
          if (url.origin !== host.origin || !allowed.has(url.pathname)) {
            unexpected.push(url.href); return route.abort()
          }
          requested.push(url.pathname)
          if (url.pathname === pagePath) return route.fulfill({contentType: 'text/html',
            body: '<!doctype html><title>Reference contracts</title><script type="importmap">' +
              JSON.stringify({imports: {'@bijux/ro-crate-core': corePath}}) + '</script>'})
          return route.continue()
        })
        const page = await context.newPage()
        page.on('pageerror', error => pageErrors.push(error.message))
        await page.goto(host.origin + pagePath)
        const rows = await page.evaluate(async ({cases, browserPath, workerPath}) => {
          const {ValidationSession} = await import(browserPath)
          const results = []
          for (const item of cases) {
            const session = new ValidationSession({debounceMs: 0,
              workerFactory: () => new Worker(workerPath, {type: 'module'})})
            let deadline, unsubscribe
            try {
              const ready = new Promise((resolve, reject) => {
                deadline = setTimeout(() => reject(new Error('Reference contract exceeded budget: ' + item.name)), 60000)
                unsubscribe = session.subscribe(snapshot => {
                  if (['valid', 'invalid', 'incomplete'].includes(snapshot.state)) resolve(snapshot)
                })
              })
              session.select(new Map(Object.entries(item.files).map(([path, value]) =>
                [path, Array.isArray(value) ? new Uint8Array(value) : value])),
              {contexts: new Map(Object.entries(item.contexts ?? {}))})
              const snapshot = await ready
              let refused = false, handoff
              try {handoff = session.continue()} catch {refused = true}
              const hashes = {}
              if (handoff) for (const [path, value] of handoff.files) {
                const bytes = typeof value === 'string' ? new TextEncoder().encode(value) :
                  value instanceof Blob ? await value.arrayBuffer() : value
                const digest = await crypto.subtle.digest('SHA-256', bytes)
                hashes[path] = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
              }
              results.push({name: item.name, result: snapshot.result, eligible: snapshot.eligible,
                refused, inputs_sha256: hashes, contexts: handoff ? Object.fromEntries(handoff.options.contexts) : null})
            } finally {clearTimeout(deadline); unsubscribe?.(); session.dispose()}
          }
          return results
        }, {cases, browserPath, workerPath})
        assertExecutedCases(selection, rows.map(row => row.name))
        for (const [index, row] of rows.entries()) {
          const item = cases[index]
          contract.assertResult(item, row.result)
          const eligible = row.result.status === 'valid'
          assert.equal(row.eligible, eligible, row.name)
          assert.equal(row.refused, !eligible, row.name)
          if (eligible) {
            assert.deepEqual(row.inputs_sha256, contract.originalByName.get(row.name).inputs_sha256, row.name)
            assert.deepEqual(row.contexts, item.contexts ?? {}, row.name)
          }
        }
        for (const path of [browserPath, workerPath, corePath]) assert.ok(requested.includes(path), path)
        assert.deepEqual(unexpected, [])
        assert.deepEqual(pageErrors, [])
        reports.push({engine, version: browser.version(), selection,
          actual_executed_case_names: rows.map(row => row.name), total: rows.length, passed: rows.length, failed: 0,
          refused_inputs: rows.filter(row => row.refused).length,
          incomplete_inputs: rows.filter(row => row.result.status === 'incomplete').length,
          valid_byte_handoffs: rows.filter(row => row.eligible).length,
          requested: [...new Set(requested)], unexpected, pageErrors})
      } finally {await browser.close()}
    }
  } finally {await host.close()}
  const report = {distribution, reference: contract.reference.reference,
    suite_sha256: createHash('sha256').update(JSON.stringify(contract.cases)).digest('hex'),
    browserPath, workerPath, corePath, reports}
  await mkdir(root + '/artifacts/reports', {recursive: true})
  await writeFile(root + '/artifacts/reports/' + distribution + '-' + suite + '.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
}
