import assert from 'node:assert/strict'
import {readFile, writeFile} from 'node:fs/promises'
import {chromium, firefox, webkit} from 'playwright'
import {serve, root} from '../host.mjs'

const fixture = new URL('../../parity/fixtures/test_minimal_valid_ro_crate/', import.meta.url)
const files = await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async path =>
  [path, await readFile(new URL(path, fixture), 'utf8')]))
const browserPath = process.env.BIJUX_BROWSER_SESSION_PATH ?? '/packages/validator/dist/browser.js'
const workerPath = process.env.BIJUX_BROWSER_WORKER_PATH ?? '/packages/validator/dist/worker.js'
const distribution = process.env.BIJUX_BROWSER_SESSION_PATH ? 'installed' : 'source'
const corePath = process.env.BIJUX_BROWSER_CORE_PATH ?? '/packages/core/dist/index.js'
if (distribution === 'installed') assert.ok(process.env.BIJUX_BROWSER_CORE_PATH, 'Installed lifecycle requires its installed core path')
const host = await serve(), reports = []
try {
  for (const [engine, implementation] of Object.entries({chromium, firefox, webkit})) {
    const browser = await implementation.launch({headless: true})
    try {
      const context = await browser.newContext({serviceWorkers: 'block'})
      const unexpected = [], errors = [], coreRequests = []
      await context.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.pathname === corePath) coreRequests.push(url.pathname)
        if (url.origin !== host.origin || (distribution === 'installed' && url.pathname.startsWith('/packages/'))) {unexpected.push(url.href); return route.abort()}
        if (url.pathname === '/session-controls') return route.fulfill({contentType: 'text/html', body: '<!doctype html><title>Session ownership controls</title><script type="importmap">' + JSON.stringify({imports: {'@bijux/ro-crate-core': corePath}}) + '</script>'})
        return route.continue()
      })
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(host.origin + '/session-controls')
      const rows = await page.evaluate(async ({files, browserPath, workerPath}) => {
        const {ValidationSession} = await import(browserPath)
        const replacement = new Map(files)
        const metadata = JSON.parse(replacement.get('ro-crate-metadata.json'))
        metadata['@graph'].find(value => value['@id'] === './').name = 'Termination replacement'
        replacement.set('ro-crate-metadata.json', JSON.stringify(metadata))
        const bounded = (promise, label) => {
          let deadline
          return Promise.race([promise, new Promise((_, reject) => {
            deadline = setTimeout(() => reject(new Error(label + ' exceeded the browser budget')), 15000)
          })]).finally(() => clearTimeout(deadline))
        }
        const wait = async (session, predicate, label) => {
          let unsubscribe
          try {
            return await bounded(new Promise(resolve => {
              unsubscribe = session.subscribe(snapshot => {if (predicate(snapshot)) resolve(snapshot)})
            }), label)
          } finally {unsubscribe?.()}
        }
        const results = []
        const failureURL = URL.createObjectURL(new Blob(["throw new Error('deliberate termination-control failure')"], {type: 'text/javascript'}))
        try {
          for (const mode of ['selection', 'edit', 'options', 'revalidation', 'cancel', 'completion', 'failure', 'deadline', 'dispose']) {
            const workers = []
            let session, armed = false, replaced = false, refused = false, release, ready
            const replacementReady = new Promise(resolve => {ready = resolve})
            session = new ValidationSession({debounceMs: 0, timeoutMs: mode === 'deadline' ? 1000 : 15000,
              workerFactory: () => {
                const index = workers.length
                const worker = new Worker(mode === 'failure' && index === 0 ? failureURL : workerPath, {type: 'module'})
                const stop = worker.terminate.bind(worker), send = worker.postMessage.bind(worker)
                const owned = {worker, stop, terminations: 0}
                workers.push(owned)
                worker.postMessage = request => {
                  owned.request = request
                  if (index === 1) {release = () => send(request); ready()}
                  else send(request)
                }
                worker.terminate = () => {
                  owned.terminations++
                  stop()
                  if (index === 0 && armed && !replaced) {
                    replaced = true
                    try {session.select(replacement, {contexts: new Map([['https://example.org/replacement-context', {'@context': {}}]])}); session.revalidate()}
                    catch (error) {if (mode === 'dispose' && /disposed/.test(error.message)) refused = true; else throw error}
                  }
                }
                return worker
              }})
            try {
              session.select(new Map(files))
              session.revalidate()
              armed = true
              if (mode === 'selection') session.select(new Map(files).set('ro-crate-metadata.json', '{'))
              if (mode === 'edit') session.edit('ro-crate-metadata.json', '{')
              if (mode === 'options') session.updateOptions({contexts: new Map([['https://example.org/superseded-context', {'@context': {}}]])})
              if (mode === 'revalidation') session.revalidate()
              if (mode === 'cancel' || mode === 'deadline') session.cancel()
              if (mode === 'dispose') {
                session.dispose()
                results.push({mode, refused, created: workers.length, terminations: workers.map(value => value.terminations), eligible: session.snapshot().eligible})
                continue
              }
              await bounded(replacementReady, mode + ' replacement')
              const pending = session.snapshot(), request = workers[1].request
              let continuationRefused = false
              try {session.continue()} catch {continuationRefused = true}
              if (pending.state !== 'validating' || pending.revision !== request.revision || pending.session !== request.session || pending.eligible || !continuationRefused)
                throw new Error('Replacement lost its pending revision during ' + mode)
              if (mode === 'deadline') {
                const expired = await wait(session, value => value.state === 'incomplete', mode)
                if (!/execution budget/.test(expired.result.reason)) throw new Error('Replacement deadline was lost')
                results.push({mode, created: workers.length, terminations: workers.map(value => value.terminations), eligible: expired.eligible, current_revision: expired.revision === request.revision})
              } else {
                const finished = wait(session, value => value.state === 'valid' && value.eligible && value.revision === request.revision, mode)
                release()
                await finished
                const handoff = session.continue()
                results.push({mode, created: workers.length, terminations: workers.map(value => value.terminations), eligible: true,
                  current_revision: handoff.revision === request.revision && handoff.session === request.session,
                  current_bytes: JSON.stringify([...handoff.files]) === JSON.stringify([...replacement]), current_options: handoff.options.contexts?.has('https://example.org/replacement-context') === true && handoff.options.contexts.size === 1})
              }
            } finally {
              session.dispose()
              for (const {stop, terminations} of workers) if (terminations === 0) stop()
            }
          }
        } finally {URL.revokeObjectURL(failureURL)}
        return results
      }, {files, browserPath, workerPath})
      assert.equal(rows.length, 9)
      for (const row of rows) {
        assert.equal(row.created, row.mode === 'dispose' ? 1 : 2, row.mode)
        assert.ok(row.terminations.every(value => value === 1), JSON.stringify(row))
        if (row.mode === 'dispose') {assert.equal(row.refused, true); assert.equal(row.eligible, false)}
        else if (row.mode === 'deadline') {assert.equal(row.current_revision, true); assert.equal(row.eligible, false)}
        else assert.ok(row.eligible && row.current_revision && row.current_bytes && row.current_options, JSON.stringify(row))
      }
      assert.ok(coreRequests.includes(corePath), 'Selected core module was not requested')
      assert.deepEqual(unexpected, [])
      assert.deepEqual(errors.filter(message => !message.includes('deliberate termination-control failure')), [])
      reports.push({engine, version: browser.version(), rows, unexpected, coreRequests, expected_worker_errors: errors})
    } finally {await browser.close()}
  }
} finally {await host.close()}
const report = {distribution, browserPath, workerPath, corePath, reports}
await writeFile(root + '/artifacts/reports/' + distribution + '-worker-termination.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
