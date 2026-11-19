import assert from 'node:assert/strict'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {chromium, firefox, webkit} from 'playwright'
import {selectedEngines} from '../ci/selection.mjs'
import {assertBrowserBindings} from '../ci/browser-bindings.mjs'
import {makeFilePathCases} from '../inputs/file-paths.mjs'
import {bindSessionCore} from './session/module-bindings.mjs'
import {serve, root} from './host.mjs'
import type {CrateFiles, ValidationResult} from '../../packages/validator/src/index.js'
import type {Session, SessionSnapshot} from '../../packages/validator/src/browser/session.js'

const fixture = root + '/tests/parity/fixtures/test_minimal_valid_ro_crate/'
const files = new Map(await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name =>
  [name, await readFile(fixture + name, 'utf8')] as const)))
// Both selected fixture files are read successfully before building these cases.
const cases = makeFilePathCases(files) as Array<{name: string; status: string; uploadedStatus: string; files: Record<string, string>}>
const browserPath = process.env.BIJUX_BROWSER_SESSION_PATH ?? '/packages/validator/dist/browser.js'
const workerPath = process.env.BIJUX_BROWSER_WORKER_PATH ?? '/packages/validator/dist/worker.js'
const validatorPath = process.env.BIJUX_BROWSER_VALIDATOR_PATH ?? '/packages/validator/dist/index.js'
const corePath = process.env.BIJUX_BROWSER_CORE_PATH ?? '/packages/core/dist/index.js'
const distribution = process.env.BIJUX_BROWSER_SESSION_PATH ? 'installed' : 'source'
assertBrowserBindings({distribution, browserPath, workerPath, validatorPath, corePath}, 'file-path-ownership')
await mkdir(root + '/artifacts/reports', {recursive: true})
const host = await serve(), reports: Array<{engine: string; version: string; total: number; actual_executed_case_names: string[]; rows: unknown[]; unexpected: string[]; errors: string[]; coreRequests: string[]}> = []
try {
  for (const [engineName, engine] of selectedEngines({chromium, firefox, webkit})) {
    const browser = await engine.launch({headless: true})
    try {
      const page = await browser.newPage(), unexpected: string[] = [], errors: string[] = [], coreRequests: string[] = []
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
      const rows = await page.evaluate(async ({cases, browserPath, workerPath, validatorPath}) => {
        const {validateCrate}: typeof import('../../packages/validator/src/index.js') = await import(validatorPath)
        const {ValidationSession}: typeof import('../../packages/validator/src/browser.js') = await import(browserPath)
        const nativeFiles = (files: CrateFiles) => new Map([...files].map(([name, value]) => {
          const file = new File([value as BlobPart], name)
          return [file.name, file]
        }))
        async function transition(session: Session, action: () => void) {
          const revision = session.snapshot().revision
          let timer: ReturnType<Window['setTimeout']> | ReturnType<typeof setTimeout> | undefined, unsubscribe: (() => void) | undefined
          try {
            const ready = new Promise<SessionSnapshot>((resolve, reject) => {
              timer = setTimeout(() => reject(new Error('Selected path validation exceeded budget')), 60000)
              unsubscribe = session.subscribe(state => {
                if (state.revision > revision && ['valid', 'invalid', 'incomplete'].includes(state.state)) resolve(state)
              })
            })
            action()
            return await ready
          } finally {clearTimeout(timer); unsubscribe?.()}
        }
        async function workerResult(files: CrateFiles) {
          const worker = new Worker(workerPath, {type: 'module'})
          let timer: ReturnType<Window['setTimeout']> | ReturnType<typeof setTimeout> | undefined
          try {
            return await new Promise<ValidationResult>((resolve, reject) => {
              timer = setTimeout(() => reject(new Error('Selected path worker exceeded budget')), 60000)
              worker.onmessage = ({data}) => data.session === 'path-values' && data.revision === 1 && data.id === 1
                ? resolve(data.result) : reject(new Error('Selected path worker changed request identity'))
              worker.onerror = event => reject(new Error(event.message))
              worker.postMessage({session: 'path-values', revision: 1, id: 1, files, options: {}})
            })
          } finally {clearTimeout(timer); worker.terminate()}
        }
        const results = [], recovery = cases.find(item => item.name === 'replacement-name')
        if (!recovery) throw new Error('Missing selected path baseline')
        for (const item of cases) {
          const files = new Map(Object.entries(item.files)), native = nativeFiles(files)
          const direct = await validateCrate(files), serialized = await validateCrate(new Map(JSON.parse(JSON.stringify([...files]))))
          const cloned = await validateCrate(structuredClone(files)), rawWorker = await workerResult(files)
          const uploaded = await validateCrate(native)
          const session = new ValidationSession({debounceMs: 0, workerFactory: () => new Worker(workerPath, {type: 'module'})})
          const states = [], continuations = []
          try {
            const prior = await transition(session, () => session.select(new Map(Object.entries(recovery.files))))
            if (!prior.eligible) throw new Error('Selected path baseline was not eligible')
            for (const action of [() => session.select(files), () => session.revalidate(), () => session.updateOptions({})]) {
              states.push(await transition(session, action))
              let handoff
              try {handoff = session.continue()} catch {continuations.push({refused: true}); continue}
              const uploaded = nativeFiles(handoff.files)
              continuations.push({refused: false, names: [...handoff.files.keys()], nativeNames: [...uploaded.keys()],
                result: await validateCrate(uploaded)})
            }
            const restored = await transition(session, () => session.select(new Map(Object.entries(recovery.files))))
            const edited = await transition(session, () => session.edit('\ufffd.tsv', recovery.files['\ufffd.tsv']))
            const handoff = session.continue()
            results.push({name: item.name, direct, serialized, cloned, rawWorker, uploaded,
              nativeNames: [...native.keys()], states, continuations,
              recovery: {selected: restored.eligible, edited: edited.eligible, names: [...handoff.files.keys()]}})
          } finally {session.dispose()}
        }
        return results
      }, {cases, browserPath, workerPath, validatorPath})
      assert.deepEqual(rows.map(row => row.name), cases.map(item => item.name))
      for (const row of rows) {
        const item = cases.find(item => item.name === row.name)
        assert.ok(item)
        const names = Object.keys(item.files)
        assert.equal(row.direct.status, item.status, row.name)
        for (const result of [row.serialized, row.cloned, row.rawWorker]) assert.deepEqual(result, row.direct, row.name)
        assert.equal(row.uploaded.status, item.uploadedStatus, row.name)
        assert.equal(row.nativeNames.length, names.length - Number(item.status === 'incomplete'))
        for (const [index, state] of row.states.entries()) {
          assert.equal(state.state, item.status, row.name)
          assert.equal(state.eligible, item.status === 'valid', row.name)
          if (item.status === 'incomplete') assert.deepEqual(state.result,
            index === 0 ? row.direct : {...row.direct, reason: 'Select local crate files first'})
          else assert.deepEqual(state.result, row.direct, row.name)
        }
        if (item.status === 'incomplete') assert.equal((row.direct as Extract<ValidationResult, {status: 'incomplete'}>).reason, 'Crate path contains an unpaired Unicode surrogate.')
        for (const handoff of row.continuations) {
          assert.equal(handoff.refused, item.status !== 'valid', row.name)
          if (!handoff.refused) {
            assert.deepEqual(handoff.names, names)
            assert.deepEqual(handoff.nativeNames, names)
            assert.equal(handoff.result.status, 'valid', row.name)
          }
        }
        assert.deepEqual(row.recovery, {selected: true, edited: true, names: ['ro-crate-metadata.json', '\ufffd.tsv']})
      }
      assert.ok(coreRequests.includes(corePath), 'Selected core module was not requested')
      assert.deepEqual(unexpected, [])
      assert.deepEqual(errors, [])
      reports.push({engine: engineName, version: browser.version(), total: rows.length,
        actual_executed_case_names: rows.map(row => row.name), rows, unexpected, errors, coreRequests})
    } finally {await browser.close()}
  }
} finally {await host.close()}
await writeFile(root + '/artifacts/reports/' + distribution + '-file-path-ownership.json',
  JSON.stringify({distribution, browserPath, workerPath, validatorPath, corePath, reports}, null, 2) + '\n')
console.log(JSON.stringify({distribution, reports: reports.map(({engine, version, total}) => ({engine, version, total}))}))
