import assert from 'node:assert/strict'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {chromium, firefox, webkit} from 'playwright'
import {selectedEngines} from '../ci/selection.mjs'
import {assertBrowserBindings} from '../ci/browser-bindings.mjs'
import {makeTextFileCases} from '../inputs/text-files.mjs'
import {bindSessionCore} from './session/module-bindings.mjs'
import {serve, root} from './host.mjs'

const fixture = root + '/tests/parity/fixtures/test_minimal_valid_ro_crate/'
const files = await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name =>
  [name, await readFile(fixture + name, 'utf8')]))
const cases = makeTextFileCases(new Map(files))
const browserPath = process.env.BIJUX_BROWSER_SESSION_PATH ?? '/packages/validator/dist/browser.js'
const workerPath = process.env.BIJUX_BROWSER_WORKER_PATH ?? '/packages/validator/dist/worker.js'
const validatorPath = process.env.BIJUX_BROWSER_VALIDATOR_PATH ?? '/packages/validator/dist/index.js'
const corePath = process.env.BIJUX_BROWSER_CORE_PATH ?? '/packages/core/dist/index.js'
const distribution = process.env.BIJUX_BROWSER_SESSION_PATH ? 'installed' : 'source'
assertBrowserBindings({distribution, browserPath, workerPath, validatorPath, corePath}, 'text-file-values')
await mkdir(root + '/artifacts/reports', {recursive: true})
const host = await serve(), reports = []
try {
  for (const [engineName, engine] of selectedEngines({chromium, firefox, webkit})) {
    const browser = await engine.launch({headless: true})
    try {
      const page = await browser.newPage(), unexpected = [], errors = [], coreRequests = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.pathname === corePath) coreRequests.push(url.pathname)
        if (url.origin !== host.origin || (distribution === 'installed' && url.pathname.startsWith('/packages/core/'))) {
          unexpected.push(url.href); return route.abort()
        }
        return route.continue()
      })
      await bindSessionCore(page, host.origin, corePath)
      await page.goto(host.origin + '/examples/submission/index.html')
      const rows = await page.evaluate(async ({files, cases, browserPath, workerPath, validatorPath}) => {
        const {validateCrate} = await import(validatorPath)
        const {ValidationSession} = await import(browserPath)
        const descriptor = 'ro-crate-metadata.json'
        async function transition(session, action) {
          const previous = session.snapshot().revision
          let timer, unsubscribe
          try {
            const ready = new Promise((resolve, reject) => {
              timer = setTimeout(() => reject(new Error('Text validation exceeded budget')), 60000)
              unsubscribe = session.subscribe(state => {
                if (state.revision > previous && ['valid', 'invalid', 'incomplete'].includes(state.state)) resolve(state)
              })
            })
            action()
            return await ready
          } finally {clearTimeout(timer); unsubscribe?.()}
        }
        async function workerResult(selected) {
          const worker = new Worker(workerPath, {type: 'module'})
          let timer
          try {
            return await new Promise((resolve, reject) => {
              timer = setTimeout(() => reject(new Error('Text worker exceeded budget')), 60000)
              worker.onmessage = ({data}) => {
                if (data.session !== 'text-values' || data.revision !== 1 || data.id !== 1)
                  return reject(new Error('Text worker changed the request identity'))
                resolve(data.result)
              }
              worker.onerror = event => reject(new Error(event.message))
              worker.postMessage({session: 'text-values', revision: 1, id: 1, files: selected, options: {}})
            })
          } finally {clearTimeout(timer); worker.terminate()}
        }
        const results = []
        for (const item of cases) {
          const selected = new Map(files).set(descriptor, item.text)
          const direct = await validateCrate(selected), rawWorker = await workerResult(selected)
          const bytes = new TextEncoder().encode(item.text)
          const encoded = await validateCrate(new Map(files).set(descriptor, bytes))
          const blob = await validateCrate(new Map(files).set(descriptor, new Blob([item.text])))
          const session = new ValidationSession({debounceMs: 0,
            workerFactory: () => new Worker(workerPath, {type: 'module'})})
          try {
            const states = [], refusals = [], handoffs = []
            async function checkContinuation() {
              let handoff
              try {handoff = session.continue()} catch {refusals.push(true); return}
              refusals.push(false)
              const upload = new Map([...handoff.files].map(([path, value]) =>
                [path, typeof value === 'string' ? new TextEncoder().encode(value) : value]))
              handoffs.push({text: handoff.files.get(descriptor), result: await validateCrate(upload)})
            }
            states.push(await transition(session, () => session.select(selected)))
            await checkContinuation()
            const ordinary = cases.find(row => row.name === 'ordinary-ascii')
            const base = await transition(session, () => session.select(new Map(files).set(descriptor, ordinary.text)))
            if (!base.eligible) throw new Error('Valid text baseline was not eligible')
            states.push(await transition(session, () => session.edit(descriptor, item.text)))
            await checkContinuation()
            if (item.status === 'incomplete') {
              states.push(await transition(session, () => session.revalidate()))
              await checkContinuation()
              states.push(await transition(session, () => session.updateOptions({})))
              await checkContinuation()
            }
            const recovery = await transition(session, () => session.edit(descriptor, ordinary.text))
            const recovered = session.continue()
            results.push({name: item.name, direct, rawWorker, encoded, blob, states, refusals, handoffs,
              recovery: {eligible: recovery.eligible, status: recovery.result.status,
                exact: recovered.files.get(descriptor) === ordinary.text}})
          } finally {session.dispose()}
        }
        return results
      }, {files, cases, browserPath, workerPath, validatorPath})
      assert.deepEqual(rows.map(row => row.name), cases.map(row => row.name))
      for (const row of rows) {
        const item = cases.find(item => item.name === row.name)
        assert.equal(row.direct.status, item.status, row.name)
        assert.deepEqual(row.rawWorker, row.direct, row.name + ' worker')
        assert.equal(row.encoded.status, item.encodedStatus, row.name + ' bytes')
        assert.deepEqual(row.blob, row.encoded, row.name + ' Blob')
        if (item.status !== 'incomplete') assert.deepEqual(row.direct, row.encoded, row.name)
        else {
          assert.equal(row.direct.stage, 'input')
          assert.equal(row.direct.reason, 'Crate text contains an unpaired Unicode surrogate.')
        }
        for (const state of row.states) {
          assert.equal(state.state, item.status, row.name)
          assert.equal(state.eligible, item.status === 'valid', row.name)
          assert.deepEqual(state.result, row.direct, row.name)
        }
        assert.deepEqual(row.refusals, Array(item.status === 'incomplete' ? 4 : 2).fill(item.status !== 'valid'), row.name)
        assert.equal(row.handoffs.length, item.status === 'valid' ? 2 : 0)
        for (const handoff of row.handoffs) {
          assert.equal(handoff.text, item.text)
          assert.equal(handoff.result.status, 'valid', row.name + ' upload bytes')
        }
        assert.deepEqual(row.recovery, {eligible: true, status: 'valid', exact: true})
      }
      assert.ok(coreRequests.includes(corePath), 'Selected core module was not requested')
      assert.deepEqual(unexpected, [])
      assert.deepEqual(errors, [])
      reports.push({engine: engineName, version: browser.version(), total: rows.length,
        actual_executed_case_names: rows.map(row => row.name), rows, unexpected, errors, coreRequests})
    } finally {await browser.close()}
  }
} finally {await host.close()}
await writeFile(root + '/artifacts/reports/' + distribution + '-text-file-values.json',
  JSON.stringify({distribution, browserPath, workerPath, validatorPath, corePath, reports}, null, 2) + '\n')
console.log(JSON.stringify({distribution, reports: reports.map(({engine, version, total}) => ({engine, version, total}))}))
