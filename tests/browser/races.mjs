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
      results.push({engine: name, delayed_success_refused: true, edit_at_continue_refused: true,
        repaired_success_control: true})
      console.log(JSON.stringify(results.at(-1)))
    } finally {await browser.close()}
  }
} finally {
  await host.close()
  await writeFile(root + '/artifacts/reports/browser-races.json', JSON.stringify(results, null, 2) + '\n')
}
