import assert from 'node:assert/strict'
import {readFile, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium, firefox, webkit} from 'playwright'
import {serve, root} from './host.mjs'

const fixture = resolve(root, 'tests/parity/fixtures/test_minimal_valid_ro_crate')
const original = await readFile(resolve(fixture, 'ro-crate-metadata.json'), 'utf8')
const invalid = JSON.parse(original)
delete invalid['@graph'].find(item => item['@id'] === './').name
const host = await serve()
const results = []
try {
  for (const [name, engine] of Object.entries({chromium, firefox, webkit})) {
    const browser = await engine.launch({headless: true})
    try {
      const page = await browser.newPage()
      await page.addInitScript(() => {
        const NativeWorker = Worker
        window.NativeValidationWorker = NativeWorker
        window.delayedValidation = []
        let jobs = 0
        window.Worker = class {
          constructor(...args) {
            const first = jobs++ === 0
            this.native = new NativeWorker(...args)
            this.native.onmessage = event => {
              const handler = this.onmessage
              if (first) window.delayedValidation.push(() => handler?.(event))
              else handler?.(event)
            }
            this.native.onerror = event => this.onerror?.(event)
            this.native.onmessageerror = event => this.onmessageerror?.(event)
          }
          postMessage(request) {this.native.postMessage(request)}
          terminate() {this.native.terminate()}
        }
      })
      await page.goto(host.origin + '/examples/submission/index.html')
      await page.getByLabel('Choose crate folder').setInputFiles(fixture)
      await page.waitForFunction(() => window.delayedValidation.length === 1)
      const editor = page.getByLabel('Edit ro-crate-metadata.json')
      await editor.fill(JSON.stringify(invalid))
      await page.waitForFunction(() => document.querySelector('#result').dataset.state === 'invalid')
      await page.evaluate(() => window.delayedValidation.pop()())
      assert.equal(await page.locator('#continue').isDisabled(), true)
      assert.equal(await page.locator('#result').getAttribute('data-state'), 'invalid')
      await editor.fill(original)
      await page.waitForFunction(() => document.querySelector('#result').dataset.state === 'valid')
      await page.evaluate(text => {
        const editor = document.querySelector('#metadata-editor')
        editor.value = text
        editor.dispatchEvent(new Event('input', {bubbles: true}))
        window.handoffs = 0
        document.addEventListener('cratevalidated', () => window.handoffs++)
        document.querySelector('#submission-form').dispatchEvent(new Event('submit', {cancelable: true}))
      }, JSON.stringify(invalid))
      assert.equal(await page.evaluate(() => window.handoffs), 0)
      assert.equal(await page.locator('#continue').isDisabled(), true)
      const lifecycle = await page.evaluate(async files => {
        const {ValidationSession} = await import('/packages/validator/dist/browser.js')
        const wait = (session, state) => new Promise((resolve, reject) => {
          let unsubscribe
          const finish = (error, snapshot) => {
            clearTimeout(timer)
            queueMicrotask(() => unsubscribe?.())
            if (error) reject(error)
            else resolve(snapshot)
          }
          const timer = setTimeout(() => finish(new Error(`Expected ${state} within browser budget`)), 15000)
          unsubscribe = session.subscribe(snapshot => {
            if (snapshot.state === state) finish(null, snapshot)
            else if (snapshot.state === 'incomplete') finish(new Error(snapshot.result.reason))
          })
        })
        const session = new ValidationSession({debounceMs: 0})
        const ready = wait(session, 'valid')
        session.select(new Map(files))
        await ready
        const previous = session.snapshot().revision
        session.updateOptions({contexts: new Map([['https://example.org/unused', {'@context': {}}]])})
        const optionsInvalidated = !session.snapshot().eligible && session.snapshot().revision > previous
        await wait(session, 'valid')
        const optionsBound = session.continue().options.contexts.size === 1
        session.dispose()
        const captured = [], barriers = []
        let workers = 0, terminations = 0
        const held = new ValidationSession({debounceMs: 0, workerFactory: () => {
          const ordinal = workers++
          const native = new window.NativeValidationWorker('/packages/validator/dist/worker.js', {type: 'module'})
          const proxy = {postMessage: request => native.postMessage(request), terminate: () => {terminations++; native.terminate()}}
          native.onmessage = event => {
            const callback = proxy.onmessage
            if (ordinal === 2) callback?.(event)
            else {captured[ordinal] = () => callback?.(event); barriers[ordinal]?.()}
          }
          native.onerror = event => proxy.onerror?.(event)
          return proxy
        }})
        const barrier = index => captured[index] ? Promise.resolve() : new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`Worker ${index} did not reach its response barrier`)), 15000)
          barriers[index] = () => {clearTimeout(timer); resolve()}
        })
        const good = new Map(files)
        const bad = new Map(files)
        const broken = JSON.parse(bad.get('ro-crate-metadata.json'))
        delete broken['@graph'].find(entity => entity['@id'] === './').name
        bad.set('ro-crate-metadata.json', JSON.stringify(broken))
        try {
          held.select(good)
          await barrier(0)
          const oldIdentity = held.snapshot().session
          held.select(bad)
          const reselectionInvalidated = !held.snapshot().eligible && held.snapshot().session !== oldIdentity
          await barrier(1)
          captured[0]()
          const staleSelectionRefused = held.snapshot().state === 'validating'
          const repaired = wait(held, 'valid')
          held.select(good)
          await repaired
          captured[1]()
          const staleFailureRefused = held.snapshot().state === 'valid' && held.snapshot().eligible
          const repairedBytes = held.continue().files.get('ro-crate-metadata.json') === good.get('ro-crate-metadata.json')
          held.select(good)
          await barrier(3)
          held.dispose()
          const disposed = JSON.stringify(held.snapshot())
          captured[3]()
          window.selectionLifecycle = {reselectionInvalidated, staleSelectionRefused, staleFailureRefused, repairedBytes,
            disposedCallbackIgnored: JSON.stringify(held.snapshot()) === disposed && !held.snapshot().eligible,
            allWorkersTerminated: terminations === workers}
        } finally {held.dispose()}
        async function failure(source, timeoutMs) {
          const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}))
          const session = new ValidationSession({debounceMs: 0, timeoutMs,
            workerFactory: () => new window.NativeValidationWorker(url, {type: 'module'})})
          try {
            const pending = wait(session, 'incomplete')
            session.select(new Map(files))
            const state = await pending
            return {eligible: state.eligible, reason: state.result.reason}
          } finally {session.dispose(); URL.revokeObjectURL(url)}
        }
        const startup = await failure("throw new Error('deliberate startup failure')", 5000)
        const crash = await failure("self.onmessage = () => {throw new Error('deliberate validation crash')}", 5000)
        const malformed = await failure("self.onmessage = ({data}) => self.postMessage({session: data.session, revision: data.revision, id: data.id, result: {status: 'valid'}})", 5000)
        const budget = await failure('self.onmessage = () => {}', 30)
        let terminated = false, running
        const busyURL = URL.createObjectURL(new Blob(["self.onmessage = () => {self.postMessage('running'); while (true) {}}"], {type: 'text/javascript'}))
        const busy = new ValidationSession({debounceMs: 0, timeoutMs: 15000, workerFactory: () => {
          const worker = new window.NativeValidationWorker(busyURL, {type: 'module'})
          const proxy = {postMessage: request => worker.postMessage(request),
            terminate: () => {terminated = true; worker.terminate()}}
          worker.onmessage = event => {
            // The harness handshake is not a validator protocol response.
            if (event.data === 'running') running()
            else proxy.onmessage?.(event)
          }
          worker.onerror = event => proxy.onerror?.(event)
          return proxy
        }})
        let startupTimer
        const started = new Promise((resolve, reject) => {
          running = resolve
          startupTimer = setTimeout(() => reject(new Error('CPU worker did not start within budget')), 10000)
        })
        try {
          busy.select(new Map(files))
          await started
          clearTimeout(startupTimer)
          const cpu_work_active = busy.snapshot().state === 'validating' && !terminated
          busy.cancel()
          return {optionsInvalidated, optionsBound, startup, crash, malformed, budget, selection: window.selectionLifecycle,
            cpu_work_active, cpu_work_terminated: terminated, cancellation_eligible: busy.snapshot().eligible}
        } finally {clearTimeout(startupTimer); busy.dispose(); URL.revokeObjectURL(busyURL)}
      }, [['ro-crate-metadata.json', original], ['file_list.tsv', await readFile(resolve(fixture, 'file_list.tsv'), 'utf8')]])
      assert.equal(lifecycle.optionsInvalidated, true)
      assert.equal(lifecycle.optionsBound, true)
      assert.equal(lifecycle.startup.eligible, false)
      assert.match(lifecycle.startup.reason, /startup failure/)
      assert.equal(lifecycle.crash.eligible, false)
      assert.match(lifecycle.crash.reason, /validation crash/)
      assert.equal(lifecycle.malformed.eligible, false)
      assert.match(lifecycle.malformed.reason, /[Mm]alformed/)
      assert.ok(Object.values(lifecycle.selection).every(value => value === true), JSON.stringify(lifecycle.selection))
      assert.equal(lifecycle.budget.eligible, false)
      assert.match(lifecycle.budget.reason, /execution budget/)
      assert.equal(lifecycle.cpu_work_active, true)
      assert.equal(lifecycle.cpu_work_terminated, true)
      assert.equal(lifecycle.cancellation_eligible, false)
      results.push({engine: name, delayed_success_refused: true, edit_at_continue_refused: true,
        repaired_success_control: true, real_worker_lifecycle: lifecycle})
      console.log(JSON.stringify(results.at(-1)))
    } finally {await browser.close()}
  }
} finally {
  await host.close()
  await writeFile(root + '/artifacts/reports/browser-races.json', JSON.stringify(results, null, 2) + '\n')
}
