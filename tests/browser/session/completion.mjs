import assert from 'node:assert/strict'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {chromium, firefox, webkit} from 'playwright'
import {selectedEngines} from '../../ci/selection.mjs'
import {assertBrowserBindings} from '../../ci/browser-bindings.mjs'
import {serve, root} from '../host.mjs'

const files = await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async path =>
  [path, await readFile(root + '/tests/parity/fixtures/test_minimal_valid_ro_crate/' + path, 'utf8')]))
const browserPath = process.env.BIJUX_BROWSER_SESSION_PATH ?? '/packages/validator/dist/browser.js'
const workerPath = process.env.BIJUX_BROWSER_WORKER_PATH ?? '/packages/validator/dist/worker.js'
const validatorPath = process.env.BIJUX_BROWSER_VALIDATOR_PATH ?? '/packages/validator/dist/index.js'
const corePath = process.env.BIJUX_BROWSER_CORE_PATH ?? '/packages/core/dist/index.js'
const distribution = process.env.BIJUX_BROWSER_SESSION_PATH ? 'installed' : 'source'
assertBrowserBindings({distribution, browserPath, workerPath, validatorPath, corePath}, 'session-completion')
await mkdir(root + '/artifacts/reports', {recursive: true})
const host = await serve(), reports = []
try {
  for (const [engine, implementation] of selectedEngines({chromium, firefox, webkit})) {
    const browser = await implementation.launch({headless: true})
    try {
      const context = await browser.newContext({serviceWorkers: 'block'})
      const unexpected = [], errors = [], coreRequests = []
      await context.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.pathname === corePath) coreRequests.push(url.pathname)
        if (url.origin !== host.origin || (distribution === 'installed' && url.pathname.startsWith('/packages/'))) {
          unexpected.push(url.href); return route.abort()
        }
        if (url.pathname === '/session-completion') return route.fulfill({contentType: 'text/html',
          body: '<!doctype html><title>Session completion</title><script type="importmap">' +
            JSON.stringify({imports: {'@bijux/ro-crate-core': corePath}}) + '</script>'})
        return route.continue()
      })
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(host.origin + '/session-completion')
      const result = await page.evaluate(async ({files, browserPath, workerPath, validatorPath}) => {
        const {ValidationSession} = await import(browserPath)
        const {validateCrate} = await import(validatorPath)
        const wait = async session => {
          const until = performance.now() + 20000
          while (performance.now() < until) {
            const state = session.snapshot()
            if (['valid', 'invalid', 'incomplete'].includes(state.state)) return state
            await new Promise(resolve => setTimeout(resolve, 10))
          }
          throw new Error('Session did not reach a terminal state')
        }
        const refused = session => {try {session.continue(); return false} catch {return true}}
        const recover = async session => {
          session.select(new Map(files)); session.revalidate()
          const state = await wait(session), handoff = state.eligible ? session.continue() : undefined
          return {state: state.state, eligible: state.eligible,
            exact: handoff && JSON.stringify([...handoff.files]) === JSON.stringify(files),
            recheck: handoff && (await validateCrate(handoff.files)).status}
        }
        const native = new URL(workerPath, location.href).href, rows = [], thrown = []
        for (const mode of ['cloneable-extra', 'transferred-port', 'transferred-stream', 'outer-port', 'outer-stream', 'throwing-termination']) {
          const source = `const inner=new Worker(${JSON.stringify(native)},{type:'module'});
            onmessage=({data})=>inner.postMessage(data);
            inner.onmessage=({data})=>{
              const transfers=[];
              if(['cloneable-extra','throwing-termination'].includes(${JSON.stringify(mode)}))data.result.telemetry={elapsed:1};
              if(['transferred-port','outer-port'].includes(${JSON.stringify(mode)})){
                const channel=new MessageChannel();
                (${JSON.stringify(mode)}==='outer-port'?data:data.result).telemetry=channel.port1;transfers.push(channel.port1)
              }
              if(['transferred-stream','outer-stream'].includes(${JSON.stringify(mode)})){
                const stream=new ReadableStream({start(controller){controller.close()}});
                (${JSON.stringify(mode)}==='outer-stream'?data:data.result).telemetry=stream;transfers.push(stream)
              }
              postMessage(data,transfers)
            };inner.onerror=event=>{throw Error(event.message)}`
          const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}))
          const received = [], workers = []
          let normal = false, extraType
          const session = new ValidationSession({debounceMs: 1000, timeoutMs: 15000, workerFactory: () => {
            const worker = new Worker(normal ? native : url, {type: 'module'})
            const owned = {terminations: 0}, stop = worker.terminate.bind(worker)
            workers.push(owned)
            const rejectsTermination = !normal && mode === 'throwing-termination'
            worker.terminate = () => {owned.terminations++; stop(); if (rejectsTermination) throw null}
            worker.addEventListener('message', ({data}) => {
              if (!normal) {
                const value = data.result.telemetry ?? data.telemetry
                received.push(value); extraType = value.constructor.name
              }
            })
            return worker
          }})
          try {
            session.select(new Map(files)); session.revalidate()
            const before = await wait(session), continued = !refused(session)
            const stopped = workers[0].terminations
            normal = true
            const recovery = await recover(session)
            session.dispose()
            rows.push({name: mode, before, continued, extraType, stopped, recovery,
              terminations: workers.map(worker => worker.terminations)})
          } finally {
            session.dispose(); URL.revokeObjectURL(url)
            for (const value of received) {
              if (value instanceof MessagePort) value.close()
              if (value instanceof ReadableStream) await value.cancel()
            }
          }
        }
        const values = [
          ['null', () => null], ['undefined', () => undefined], ['string', () => 'input rejected'],
          ['number', () => 42], ['zero', () => 0], ['false', () => false],
          ['symbol', () => Symbol('rejected')], ['empty-string', () => ''], ['whitespace', () => ' \n '],
          ['empty-error', () => new Error('')], ['null-prototype', () => Object.create(null)],
          ['throwing-message', () => ({get message() {throw null}})],
          ['throwing-coercion', () => ({toString() {throw undefined}})],
          ['hostile-message-coercion', () => ({get message() {throw null}, [Symbol.toPrimitive]() {throw undefined}})],
        ]
        for (const boundary of ['factory', 'selection-options', 'option-changes', 'file-iterator']) {
          let value, fail = true
          const session = new ValidationSession({debounceMs: 1000, workerFactory: () => {
            if (fail && boundary === 'factory') throw value
            return new Worker(native, {type: 'module'})
          }})
          try {
            for (const [label, make] of values) {
              value = make()
              const options = {get contexts() {throw value}}
              if (boundary === 'factory') {session.select(new Map(files)); session.revalidate()}
              if (boundary === 'selection-options') session.select(new Map(files), options)
              if (boundary === 'option-changes') {session.select(new Map(files)); session.updateOptions(options)}
              if (boundary === 'file-iterator') session.select({*[Symbol.iterator]() {throw value}})
              thrown.push({name: boundary + '/' + label, state: session.snapshot(), refused: refused(session)})
            }
            fail = false
            thrown.push({name: boundary + '/recovery', recovery: await recover(session)})
          } finally {session.dispose()}
        }
        return {rows, thrown}
      }, {files, browserPath, workerPath, validatorPath})
      assert.deepEqual(result.rows.map(row => row.name), ['cloneable-extra', 'transferred-port', 'transferred-stream', 'outer-port', 'outer-stream', 'throwing-termination'])
      const recovery = {state: 'valid', eligible: true, exact: true, recheck: 'valid'}
      for (const row of result.rows) {
        const status = ['cloneable-extra', 'outer-port', 'outer-stream'].includes(row.name) ? 'valid' : 'incomplete'
        assert.equal(row.before.state, status, row.name)
        assert.equal(row.before.eligible, status === 'valid', row.name)
        assert.equal(row.continued, status === 'valid', row.name)
        if (status === 'incomplete') assert.ok(row.before.result.reason.trim(), row.name)
        assert.equal(row.extraType, {'cloneable-extra': 'Object', 'transferred-port': 'MessagePort', 'transferred-stream': 'ReadableStream',
          'outer-port': 'MessagePort', 'outer-stream': 'ReadableStream', 'throwing-termination': 'Object'}[row.name])
        assert.equal(row.stopped, 1)
        assert.deepEqual(row.terminations, [1, 1])
        assert.deepEqual(row.recovery, recovery)
      }
      assert.equal(result.thrown.length, 60)
      for (const row of result.thrown) {
        if (row.recovery) {assert.deepEqual(row.recovery, recovery); continue}
        assert.equal(row.state.state, 'incomplete', row.name)
        assert.equal(row.state.eligible, false, row.name)
        assert.equal(typeof row.state.result.reason, 'string', row.name)
        assert.ok(row.state.result.reason.trim(), row.name)
        assert.equal(row.refused, true, row.name)
      }
      assert.ok(coreRequests.includes(corePath), 'Selected core module was not requested')
      assert.deepEqual(unexpected, [])
      assert.deepEqual(errors, [])
      reports.push({engine, version: browser.version(), rows: result.rows, thrown: result.thrown,
        actual_executed_case_names: [...result.rows, ...result.thrown].map(row => row.name), unexpected, errors, coreRequests})
    } finally {await browser.close()}
  }
} finally {await host.close()}
const report = {distribution, browserPath, workerPath, validatorPath, corePath, reports}
await writeFile(root + '/artifacts/reports/' + distribution + '-session-completion.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({distribution, browserPath, workerPath, validatorPath, corePath,
  reports: reports.map(({engine, version, actual_executed_case_names}) => ({engine, version, actual_executed_case_names}))}))
