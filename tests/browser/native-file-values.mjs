import {bindSessionCore} from './session/module-bindings.mjs'
import assert from 'node:assert/strict'
import {readFile, writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {chromium, firefox, webkit} from 'playwright'
import {compareResult} from '../parity/compare.mjs'
import {serve, root} from './host.mjs'

const fixture = root + '/tests/parity/fixtures/test_minimal_valid_ro_crate/'
const files = await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name => [name, await readFile(fixture + name, 'utf8')]))
const expected = JSON.parse(await readFile(root + '/tests/parity/expected/crates.json')).cases
  .find(c => c.name === 'upstream/test_minimal_valid_ro_crate')
assert.ok(expected)
const hashes = Object.fromEntries(files.map(([path, text]) => [path, createHash('sha256').update(text).digest('hex')]))
assert.deepEqual(hashes, expected.inputs_sha256)
const browserPath = process.env.BIJUX_BROWSER_SESSION_PATH ?? '/packages/validator/dist/browser.js'
const workerPath = process.env.BIJUX_BROWSER_WORKER_PATH ?? '/packages/validator/dist/worker.js'
const validatorPath = process.env.BIJUX_BROWSER_VALIDATOR_PATH ?? '/packages/validator/dist/index.js'
const corePath = process.env.BIJUX_BROWSER_CORE_PATH ?? '/packages/core/dist/index.js'
const distribution = process.env.BIJUX_BROWSER_SESSION_PATH ? 'installed' : 'source'
if (distribution === 'installed') assert.ok(process.env.BIJUX_BROWSER_CORE_PATH, 'Installed Session controls require their installed core path')
const host = await serve(), reports = []
try {
  for (const [name, engine] of Object.entries({chromium, firefox, webkit})) {
    const browser = await engine.launch({headless: true})
    try {
      const page = await browser.newPage(), unexpected = [], errors = [], coreRequests = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.pathname === corePath) coreRequests.push(url.pathname)
        if (url.origin !== host.origin || (distribution === 'installed' && url.pathname.startsWith('/packages/core/'))) {unexpected.push(route.request().url()); return route.abort()}
        return route.continue()
      })
      await bindSessionCore(page, host.origin, corePath)
      await page.goto(host.origin + '/examples/submission/index.html')
      await page.evaluate(async () => {
        const frame = document.createElement('iframe')
        const ready = new Promise(resolve => frame.onload = resolve)
        frame.srcdoc = '<input type="file" multiple>'
        document.body.append(frame)
        await ready
      })
      const frame = page.frames().find(frame => frame !== page.mainFrame())
      await frame.locator('input').setInputFiles(files.map(([name]) => fixture + name))
      const rows = await page.evaluate(async ({files, browserPath, workerPath, validatorPath, corePath}) => {
        const {validateCrate} = await import(validatorPath)
        const {ValidationSession} = await import(browserPath)
        const {createWorkspace, snapshotFiles} = await import(corePath)
        const foreign = document.querySelector('iframe').contentWindow
        const picker = [...foreign.document.querySelector('input').files]
        const kinds = ['File', 'Blob', 'Uint8Array', 'ArrayBuffer', 'picker', 'zero-size', 'throwing-size']
        const rows = []
        for (const kind of kinds) {
          let calls = 0
          class InputBlob extends Blob {
            get size() {calls++; if (kind === 'throwing-size') throw new Error('caller size'); return 0}
            arrayBuffer() {calls++; throw new Error('caller reader')}
            slice() {calls++; throw new Error('caller slice')}
          }
          const entries = kind === 'picker' ? picker.map(file => [file.name, file]) : files.map(([path, text]) => {
            const bytes = new TextEncoder().encode(text)
            const value = kind === 'File' ? new foreign.File([text], path) :
              kind === 'Blob' ? new foreign.Blob([text]) :
              kind === 'Uint8Array' ? new foreign.Uint8Array(bytes) :
              kind === 'ArrayBuffer' ? new foreign.Uint8Array(bytes).buffer : new InputBlob([text])
            return [path, value]
          })
          const selected = new Map(entries)
          const workspace = createWorkspace(selected), snapshot = snapshotFiles(selected)
          const direct = validateCrate(selected)
          const session = new ValidationSession({debounceMs: 0, workerFactory: () => new Worker(workerPath, {type: 'module'})})
          let timer, unsubscribe
          try {
            const terminal = new Promise((resolve, reject) => {
              timer = setTimeout(() => reject(new Error('Native file validation timed out: ' + kind)), 60000)
              unsubscribe = session.subscribe(state => {
                if (['valid', 'invalid', 'incomplete'].includes(state.state)) resolve(state)
              })
            })
            session.select(selected)
            if (kind === 'Uint8Array') for (const [, value] of selected) value.fill(0)
            if (kind === 'ArrayBuffer') for (const [, value] of selected) new Uint8Array(value).fill(0)
            const state = await terminal
            const handoff = session.continue(), byteHashes = {}, snapshots = {}
            for (const [path, text] of files) {
              if (await workspace.readText(path) !== text) throw new Error('Workspace lost native bytes: ' + kind)
              if (await createWorkspace(snapshot).readText(path) !== text) throw new Error('Snapshot lost native bytes: ' + kind)
              const value = handoff.files.get(path)
              const bytes = ArrayBuffer.isView(value) || value instanceof ArrayBuffer ? value : await value.arrayBuffer()
              byteHashes[path] = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('')
              if (typeof value.size === 'number') snapshots[path] = {size: value.size, bytes: bytes.byteLength,
                slice: await value.slice().text() === text}
            }
            rows.push({kind, direct: await direct, result: state.result, eligible: state.eligible, hashes: byteHashes, snapshots, calls})
          } finally {clearTimeout(timer); unsubscribe?.(); session.dispose()}
        }
        return rows
      }, {files, browserPath, workerPath, validatorPath, corePath})
      for (const row of rows) {
        compareResult(row.direct, expected, row.kind + ' direct')
        compareResult(row.result, expected, row.kind + ' session')
        assert.equal(row.eligible, true)
        assert.deepEqual(row.hashes, hashes)
        assert.equal(row.calls, 0)
        for (const value of Object.values(row.snapshots)) {
          assert.equal(value.size, value.bytes)
          assert.equal(value.slice, true)
        }
      }
      assert.equal(rows.length, 7)
      assert.ok(coreRequests.includes(corePath), 'Selected core module was not requested')
      assert.deepEqual(unexpected, [])
      assert.deepEqual(errors, [])
      reports.push({engine: name, version: browser.version(), rows, unexpected, errors, coreRequests})
    } finally {await browser.close()}
  }
} finally {await host.close()}
await writeFile(root + '/artifacts/reports/' + distribution + '-native-file-values.json', JSON.stringify({distribution, browserPath, workerPath, validatorPath, corePath, hashes, reports}, null, 2) + '\n')
console.log(JSON.stringify({distribution, reports: reports.map(({engine, version, rows}) => ({engine, version, passed: rows.length}))}))
