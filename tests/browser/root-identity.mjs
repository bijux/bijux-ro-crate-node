import {selectedEngines} from '../ci/selection.mjs'
import assert from 'node:assert/strict'
import {readFile, writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {chromium, firefox, webkit} from 'playwright'
import {compareResult} from '../parity/compare.mjs'
import {assertInputBytes} from '../parity/inputs.mjs'
import {serve, root} from './host.mjs'

const cases = JSON.parse(await readFile(root + '/tests/parity/inputs/rdf-root-identity.json')).cases
cases.push(...JSON.parse(await readFile(root + '/tests/parity/inputs/rdf-physical-base-controls.json')).cases)
const policy = JSON.parse(await readFile(root + '/tests/reference/physical-base/inputs.json')).cases
const characterization = JSON.parse(await readFile(root + '/tests/reference/physical-base/expected.json'))
assert.equal(characterization.corpus_sha256, createHash('sha256').update(JSON.stringify(policy)).digest('hex'))
const policyReceipts = new Map(characterization.cases.map(item => [item.name, item]))
const policyResult = {status: 'incomplete', stage: 'preflight',
  reason: 'RDF identifiers depend on a physical parent directory outside the selected crate.',
  report: {highest_error_level: null, issues: {CRITICAL: [], ERROR: [], WARNING: [], INFO: [], DEBUG: []}}}
const expected = new Map(JSON.parse(await readFile(root + '/tests/parity/expected/crates.json')).cases.map(item => [item.name, item]))
for (const item of cases) assertInputBytes(item, expected.get(item.name))
for (const item of policy) {assertInputBytes(item, policyReceipts.get(item.name)); expected.set(item.name, policyResult)}
cases.push(...policy)
const browserPath = process.env.BIJUX_BROWSER_SESSION_PATH ?? '/packages/validator/dist/browser.js'
const workerPath = process.env.BIJUX_BROWSER_WORKER_PATH ?? '/packages/validator/dist/worker.js'
const validatorPath = process.env.BIJUX_BROWSER_VALIDATOR_PATH ?? '/packages/validator/dist/index.js'
const corePath = process.env.BIJUX_BROWSER_CORE_PATH ?? '/packages/core/dist/index.js'
const distribution = process.env.BIJUX_BROWSER_SESSION_PATH ? 'installed' : 'source'
if (distribution === 'installed') {
  assert.ok(process.env.BIJUX_BROWSER_VALIDATOR_PATH)
  assert.ok(process.env.BIJUX_BROWSER_CORE_PATH)
}
const html = '<!doctype html><html><head><link rel="icon" href="data:,">' +
  '<script type="importmap">' + JSON.stringify({imports: {'@bijux/ro-crate-core': corePath}}) + '</script></head><body></body></html>'
const host = await serve(), reports = []
try {
  for (const [engineName, engine] of selectedEngines({chromium, firefox, webkit})) {
    const browser = await engine.launch({headless: true})
    try {
      for (const [mode, origin] of [['secure', host.origin], ['insecure', 'http://root-identity.invalid']]) {
        const context = await browser.newContext({serviceWorkers: 'block'})
        const page = await context.newPage(), unexpected = [], errors = [], coreRequests = []
        page.on('pageerror', error => errors.push(error.message))
        await context.route('**/*', async route => {
          const url = new URL(route.request().url())
          if (url.origin !== origin) {unexpected.push(url.href); return route.abort()}
          if (url.pathname === '/') return route.fulfill({contentType: 'text/html', body: html})
          if (![browserPath, workerPath, validatorPath, corePath].includes(url.pathname)) {
            unexpected.push(url.href); return route.abort()
          }
          if (url.pathname === corePath) coreRequests.push(url.pathname)
          return route.fulfill({contentType: 'text/javascript', body: await readFile(root + url.pathname)})
        })
        try {
          await page.goto(origin + '/')
          const result = await page.evaluate(async ({cases, browserPath, workerPath, validatorPath, sessionSupported}) => {
            const nativeRandom = typeof globalThis.crypto?.getRandomValues === 'function'
            if (!nativeRandom) throw new Error('Native randomness is unavailable in ' + location.origin)
            crypto.getRandomValues(new Uint8Array(32))
            const {validateCrate} = await import(validatorPath)
            const {ValidationSession} = await import(browserPath)
            const rows = []
            for (const item of cases) {
              const files = new Map(Object.entries(item.files))
              const options = {contexts: new Map(Object.entries(item.contexts ?? {}))}
              const direct = await validateCrate(files, options)
              const repeated = await validateCrate(files, options)
              const session = sessionSupported
                ? new ValidationSession({debounceMs: 0, workerFactory: () => new Worker(workerPath, {type: 'module'})}) : null
              let rawWorker
              let timer, unsubscribe
              try {
                const ready = new Promise((resolve, reject) => {
                  timer = setTimeout(() => reject(new Error('Root identity worker exceeded budget')), 60000)
                  if (session) unsubscribe = session.subscribe(state => {
                    if (['valid', 'invalid', 'incomplete'].includes(state.state)) resolve(state)
                  })
                  else {
                    rawWorker = new Worker(workerPath, {type: 'module'})
                    rawWorker.onerror = event => reject(new Error(event.message))
                    rawWorker.onmessage = event => resolve({result: event.data.result})
                  }
                })
                if (session) session.select(files, options)
                else rawWorker.postMessage({session: 'root-identity', revision: 0, id: 0, files, options})
                const state = await ready
                let handed = null, refused = false
                if (session) {try {handed = [...session.continue().files]} catch {refused = true}}
                rows.push({name: item.name, direct, repeated, worker: state.result, eligible: state.eligible, handed, refused})
              } finally {clearTimeout(timer); unsubscribe?.(); session?.dispose(); rawWorker?.terminate()}
            }
            return {nativeRandom, secureContext: isSecureContext, rows}
          }, {cases, browserPath, workerPath, validatorPath, sessionSupported: mode === 'secure'})
          assert.equal(result.secureContext, mode === 'secure')
          for (const row of result.rows) {
            const wanted = expected.get(row.name), item = cases.find(c => c.name === row.name)
            if (policyReceipts.has(row.name)) {
              assert.deepEqual(row.direct, policyResult)
              assert.deepEqual(row.worker, policyResult)
            } else {
              compareResult(row.direct, wanted, row.name)
              compareResult(row.worker, wanted, row.name)
            }
            assert.deepEqual(row.repeated, row.direct)
            assert.deepEqual(row.worker, row.direct)
            if (mode === 'secure') {
              assert.equal(row.eligible, wanted.status === 'valid')
              assert.equal(row.refused, wanted.status !== 'valid')
              if (row.eligible) assert.deepEqual(new Map(row.handed), new Map(Object.entries(item.files)))
            }
            const supplied = new Set(JSON.stringify(item.files).match(/bijux-ro-crate-[0-9a-f]{32}/g) ?? [])
            for (const token of JSON.stringify(row.direct).match(/bijux-ro-crate-[0-9a-f]{32}/g) ?? []) assert.ok(supplied.has(token))
          }
          assert.equal(result.rows.length, cases.length)
          assert.ok(coreRequests.includes(corePath), 'Selected core module was not requested')
          assert.deepEqual(unexpected, [])
          assert.deepEqual(errors, [])
          reports.push({engine: engineName, version: browser.version(), mode, nativeRandom: result.nativeRandom,
            total: result.rows.length, parity_cases: cases.length - policy.length, physical_parent_cases: policy.length,
            deterministic_reports: true, worker_equal_to_direct: true,
            complete_findings: true, session_checked: mode === 'secure', exact_valid_handoffs: mode === 'secure', unexpected, errors, coreRequests})
        } finally {await context.close()}
      }
    } finally {await browser.close()}
  }
} finally {await host.close()}
await writeFile(root + '/artifacts/reports/' + distribution + '-root-identity.json', JSON.stringify({distribution, browserPath, workerPath, validatorPath, corePath, reports}, null, 2) + '\n')
console.log(JSON.stringify({distribution, reports}))
