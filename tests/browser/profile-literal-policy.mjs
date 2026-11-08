import {selectedEngines} from '../ci/selection.mjs'
import assert from 'node:assert/strict'
import {mkdir, writeFile} from 'node:fs/promises'
import {chromium, firefox, webkit} from 'playwright'
import {cases, assertPolicyResult, datasetTargets, failOpen, python, reference} from '../reference/profile-literal-targets/checks.mjs'
import {serve, root} from './host.mjs'

const browserPath = process.env.BIJUX_BROWSER_SESSION_PATH ?? '/packages/validator/dist/browser.js'
const workerPath = process.env.BIJUX_BROWSER_WORKER_PATH ?? '/packages/validator/dist/worker.js'
const corePath = process.env.BIJUX_BROWSER_CORE_PATH ?? '/packages/core/dist/index.js'
const distribution = process.env.BIJUX_BROWSER_SESSION_PATH ? 'installed' : 'source'
if (distribution === 'installed') assert.ok(process.env.BIJUX_BROWSER_CORE_PATH, 'Installed policy checks require installed core')
const pagePath = '/profile-literal-policy-controls'
const allowed = new Set([pagePath, browserPath, workerPath, corePath])
const host = await serve(), reports = []
try {
  for (const [name, engine] of selectedEngines({chromium, firefox, webkit})) {
    const browser = await engine.launch({headless: true})
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
          body: '<!doctype html><title>Literal Dataset policy controls</title><script type="importmap">' +
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
              deadline = setTimeout(() => reject(new Error('Literal policy control exceeded budget: ' + item.name)), 60000)
              unsubscribe = session.subscribe(snapshot => {
                if (['valid', 'invalid', 'incomplete'].includes(snapshot.state)) resolve(snapshot)
              })
            })
            session.select(new Map(Object.entries(item.files)),
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
      assert.equal(rows.length, cases.length)
      for (const row of rows) {
        const item = cases.find(candidate => candidate.name === row.name)
        assertPolicyResult(item, row.result)
        assert.equal(row.eligible, !datasetTargets.has(row.name), row.name)
        assert.equal(row.refused, datasetTargets.has(row.name), row.name)
        if (row.eligible) {
          assert.deepEqual(row.inputs_sha256, python.get(row.name).inputs_sha256, row.name)
          assert.deepEqual(row.contexts, item.contexts ?? {}, row.name)
        }
      }
      for (const path of [browserPath, workerPath, corePath]) assert.ok(requested.includes(path), path)
      assert.deepEqual(unexpected, [])
      assert.deepEqual(pageErrors, [])
      reports.push({engine: name, version: browser.version(), policy_cases: rows.length,
        reference_disagreements: failOpen.size, refused_dataset_literals: rows.filter(row => row.refused).length,
        valid_byte_handoffs: rows.filter(row => row.eligible).length, requested: [...new Set(requested)], unexpected, pageErrors})
    } finally {await browser.close()}
  }
} finally {await host.close()}
const report = {distribution, reference: reference.reference, suite_sha256: reference.suite_sha256,
  browserPath, workerPath, corePath, reports}
await mkdir(root + '/artifacts/reports', {recursive: true})
await writeFile(root + '/artifacts/reports/' + distribution + '-profile-literal-policy.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
