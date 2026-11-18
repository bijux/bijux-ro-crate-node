import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdir, writeFile} from 'node:fs/promises'
import {chromium, firefox, webkit} from 'playwright'
import {selectCases, selectedEngines, assertExecutedCases} from '../../ci/selection.mjs'
import {assertBrowserBindings} from '../../ci/browser-bindings.mjs'
import {serve, root} from '../host.mjs'
import type {SessionSnapshot} from '../../../packages/validator/src/browser/session.js'
import type {ValidationResult} from '../../../packages/validator/src/index.js'

interface ReferenceCase {name: string; files: Record<string, string | number[]>; contexts?: Record<string, unknown>}
interface ReferenceContract<T extends ReferenceCase> {cases: T[]; reference: {reference: string}; originalByName: ReadonlyMap<string, {inputs_sha256: unknown}>; assertResult(item: T, result: ValidationResult): void}

/** Qualify exact reference contracts and continuation through the owned Session. */
export async function runReferenceContracts<T extends ReferenceCase>(suite: string, contract: ReferenceContract<T>) {
  const {cases, receipt: selection} = selectCases(contract.cases, {suite})
  const browserCases: ReferenceCase[] = cases
  const browserPath = process.env.BIJUX_BROWSER_SESSION_PATH ?? '/packages/validator/dist/browser.js'
  const workerPath = process.env.BIJUX_BROWSER_WORKER_PATH ?? '/packages/validator/dist/worker.js'
  const corePath = process.env.BIJUX_BROWSER_CORE_PATH ?? '/packages/core/dist/index.js'
  const distribution = process.env.BIJUX_BROWSER_SESSION_PATH ? 'installed' : 'source'
  assertBrowserBindings({distribution, browserPath, workerPath, corePath}, 'session-continuation')
  const pagePath = '/reference-contract-controls'
  const allowed = new Set([pagePath, browserPath, workerPath, corePath])
  const host = await serve(), reports: unknown[] = []
  try {
    for (const [engine, implementation] of selectedEngines({chromium, firefox, webkit})) {
      const browser = await implementation.launch({headless: true})
      try {
        const context = await browser.newContext({serviceWorkers: 'block'})
        const requested: string[] = [], unexpected: string[] = [], pageErrors: string[] = []
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
          const {ValidationSession}: typeof import('../../../packages/validator/src/browser.js') = await import(browserPath)
          const results = []
          for (const item of cases) {
            const session = new ValidationSession({debounceMs: 0,
              workerFactory: () => new Worker(workerPath, {type: 'module'})})
            let deadline: ReturnType<Window['setTimeout']> | ReturnType<typeof setTimeout> | undefined, unsubscribe: (() => void) | undefined
            try {
              const ready = new Promise<SessionSnapshot>((resolve, reject) => {
                deadline = setTimeout(() => reject(new Error('Reference contract exceeded budget: ' + item.name)), 60000)
                unsubscribe = session.subscribe(snapshot => {
                  if (['valid', 'invalid', 'incomplete'].includes(snapshot.state)) resolve(snapshot)
                })
              })
              session.select(new Map(Object.entries(item.files).map(([path, value]) =>
                [path, Array.isArray(value) ? new Uint8Array(value) : value])),
              {contexts: new Map(Object.entries(item.contexts ?? {}))})
              const snapshot = await ready
              let refused = false, handoff: ReturnType<InstanceType<typeof ValidationSession>['continue']> | undefined
              try {handoff = session.continue()} catch {refused = true}
              const hashes: Record<string, string> = {}
              if (handoff) for (const [path, value] of handoff.files) {
                const bytes = typeof value === 'string' ? new TextEncoder().encode(value) :
                  value instanceof Blob ? await value.arrayBuffer() : value
                // Session handoffs copy typed arrays into ordinary ArrayBuffers.
                const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
                hashes[path] = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
              }
              results.push({name: item.name, result: snapshot.result, eligible: snapshot.eligible,
                refused, inputs_sha256: hashes, contexts: handoff ? Object.fromEntries(handoff.options.contexts!) : null})
            } finally {clearTimeout(deadline); unsubscribe?.(); session.dispose()}
          }
          return results
        }, {cases: browserCases, browserPath, workerPath})
        assertExecutedCases(selection, rows.map(row => row.name))
        for (const [index, row] of rows.entries()) {
          const item = cases[index]
          contract.assertResult(item, row.result!)
          const eligible = row.result!.status === 'valid'
          assert.equal(row.eligible, eligible, row.name)
          assert.equal(row.refused, !eligible, row.name)
          if (eligible) {
            assert.deepEqual(row.inputs_sha256, contract.originalByName.get(row.name)!.inputs_sha256, row.name)
            assert.deepEqual(row.contexts, item.contexts ?? {}, row.name)
          }
        }
        for (const path of [browserPath, workerPath, corePath]) assert.ok(requested.includes(path), path)
        assert.deepEqual(unexpected, [])
        assert.deepEqual(pageErrors, [])
        reports.push({engine, version: browser.version(), selection,
          actual_executed_case_names: rows.map(row => row.name), total: rows.length, passed: rows.length, failed: 0,
          refused_inputs: rows.filter(row => row.refused).length,
          incomplete_inputs: rows.filter(row => row.result!.status === 'incomplete').length,
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
