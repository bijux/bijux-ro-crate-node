import {selectedEngines} from '../ci/selection.mjs'
import {bindSessionCore} from './session/module-bindings.mjs'
import assert from 'node:assert/strict'
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import {chromium, firefox, webkit} from 'playwright'
import {compareResult} from '../parity/compare.mjs'
import {assertInputBytes} from '../parity/inputs.mjs'
import {serve, root} from './host.mjs'

const inputs = JSON.parse(await readFile(root + '/tests/parity/inputs/selected-colon-paths.json')).cases
const wanted = new Set(['root-colon', 'percent-colon', 'colon-unused-image'].map(name => 'selected-paths/' + name))
const cases = inputs.filter(item => wanted.has(item.name))
assert.equal(cases.length, 3)
const oracle = JSON.parse(await readFile(root + '/tests/parity/expected/crates.json'))
const expected = new Map(oracle.cases.map(item => [item.name, item]))
const directories = new Map()
for (const item of cases) {
  assertInputBytes(item, expected.get(item.name))
  const directory = root + '/artifacts/work/native-selection/' + item.name.split('/').at(-1)
  await rm(directory, {recursive: true, force: true})
  await mkdir(directory, {recursive: true})
  for (const [path, content] of Object.entries(item.files)) await writeFile(directory + '/' + path, content)
  directories.set(item.name, directory)
}
const browserPath = process.env.BIJUX_BROWSER_SESSION_PATH ?? '/packages/validator/dist/browser.js'
const workerPath = process.env.BIJUX_BROWSER_WORKER_PATH ?? '/packages/validator/dist/worker.js'
const validatorPath = process.env.BIJUX_BROWSER_VALIDATOR_PATH ?? '/packages/validator/dist/index.js'
const corePath = process.env.BIJUX_BROWSER_CORE_PATH ?? '/packages/core/dist/index.js'
const distribution = process.env.BIJUX_BROWSER_SESSION_PATH ? 'installed' : 'source'
if (distribution === 'installed') {
  assert.ok(process.env.BIJUX_BROWSER_CORE_PATH, 'Installed picker controls require their installed core path')
  assert.ok(process.env.BIJUX_BROWSER_VALIDATOR_PATH, 'Installed picker controls require their installed validator path')
}
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
          unexpected.push(url.href)
          return route.abort()
        }
        return route.continue()
      })
      await bindSessionCore(page, host.origin, corePath)
      await page.goto(host.origin + '/examples/submission/index.html')
      await page.evaluate(() => {
        const picker = document.createElement('input')
        picker.id = 'native-colon-selection'
        picker.type = 'file'
        picker.webkitdirectory = true
        document.body.append(picker)
      })
      const rows = []
      for (const item of cases) {
        await page.locator('#native-colon-selection').setInputFiles(directories.get(item.name))
        const row = await page.evaluate(async ({browserPath, workerPath, validatorPath, corePath}) => {
          const {fromDirectory, createWorkspace} = await import(corePath)
          const {validateCrate} = await import(validatorPath)
          const {ValidationSession} = await import(browserPath)
          const files = fromDirectory(document.querySelector('#native-colon-selection').files)
          const workspace = createWorkspace(files)
          const text = Object.fromEntries(await Promise.all([...files.keys()].map(async path => [path, await workspace.readText(path)])))
          const session = new ValidationSession({debounceMs: 0, workerFactory: () => new Worker(workerPath, {type: 'module'})})
          let timeout, unsubscribe
          try {
            const terminal = new Promise((resolve, reject) => {
              timeout = setTimeout(() => reject(new Error('Native colon selection exceeded validation budget')), 60000)
              unsubscribe = session.subscribe(state => {
                if (['valid', 'invalid', 'incomplete'].includes(state.state)) resolve(state)
              })
            })
            session.select(files)
            const state = await terminal
            const hashes = {}
            for (const [path, value] of session.continue().files) {
              const digest = await crypto.subtle.digest('SHA-256', await value.arrayBuffer())
              hashes[path] = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
            }
            return {direct: await validateCrate(files), result: state.result, eligible: state.eligible, text, hashes}
          } finally {clearTimeout(timeout); unsubscribe?.(); session.dispose()}
        }, {browserPath, workerPath, validatorPath, corePath})
        compareResult(row.direct, expected.get(item.name), item.name + ' direct picker')
        compareResult(row.result, expected.get(item.name), item.name + ' worker picker')
        assert.equal(row.eligible, true)
        assert.deepEqual(row.text, item.files)
        assert.deepEqual(row.hashes, expected.get(item.name).inputs_sha256)
        rows.push({name: item.name, status: row.result.status, hashes: row.hashes})
      }
      assert.ok(coreRequests.includes(corePath), 'Selected core module was not requested')
      assert.deepEqual(unexpected, [])
      assert.deepEqual(errors, [])
      reports.push({engine: engineName, version: browser.version(), passed: rows.length, rows, unexpected, errors, coreRequests})
    } finally {await browser.close()}
  }
} finally {await host.close()}
const report = {distribution, reference: oracle.commit, browserPath, workerPath, validatorPath, corePath, reports}
await mkdir(root + '/artifacts/reports', {recursive: true})
await writeFile(root + '/artifacts/reports/' + distribution + '-selected-colon-paths.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
