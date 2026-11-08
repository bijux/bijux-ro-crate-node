import {selectedEngines} from '../ci/selection.mjs'
import assert from 'node:assert/strict'
import {readFile, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium, firefox, webkit} from 'playwright'
import {serve, root} from './host.mjs'

const fixture = resolve(root, 'tests/parity/fixtures/test_minimal_valid_ro_crate')
const original = await readFile(resolve(fixture, 'ro-crate-metadata.json'), 'utf8')
const invalid = JSON.parse(original)
delete invalid['@graph'].find(item => item['@id'] === './').name
const manifest = await readFile(resolve(fixture, 'file_list.tsv'), 'utf8')
const host = await serve()
const reports = []
try {
  for (const [name, engine] of selectedEngines({chromium, firefox, webkit})) {
    const browser = await engine.launch({headless: true})
    try {
      const page = await browser.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(host.origin + '/examples/submission/index.html')
      await page.evaluate(() => {
        window.submissions = []
        document.addEventListener('cratevalidated', event => {
          window.submissions.push({revision: event.detail.revision, files: [...event.detail.files]})
        })
      })
      const state = value => page.waitForFunction(value => document.querySelector('#result').dataset.state === value, value)
      await page.getByLabel('Choose crate folder').setInputFiles(fixture)
      await state('valid')
      const editor = page.getByLabel('Edit ro-crate-metadata.json')
      await editor.fill(JSON.stringify(invalid))
      assert.equal(await page.locator('#continue').isDisabled(), true)
      await state('invalid')
      assert.match(await page.locator('#issues').innerText(), /name/)
      await editor.fill(original)
      await state('valid')
      const table = page.getByLabel('Edit declared manifest', {exact: true})
      await table.fill(manifest + 'image.tif\t#missing-dataset\n')
      assert.equal(await page.locator('#continue').isDisabled(), true)
      await state('invalid')
      await table.focus()
      await page.keyboard.press('ControlOrMeta+A')
      await page.keyboard.insertText(manifest)
      await state('valid')
      await editor.focus()
      await page.keyboard.press('Tab')
      await page.locator('#continue').click()
      const submissions = await page.evaluate(() => window.submissions)
      assert.equal(submissions.length, 1)
      const bytes = new Map(submissions[0].files)
      assert.equal(bytes.get('ro-crate-metadata.json'), original)
      assert.equal(bytes.get('file_list.tsv'), manifest)
      await editor.fill('{')
      await state('incomplete')
      await page.locator('#submission-form').evaluate(form => form.dispatchEvent(new Event('submit', {cancelable: true})))
      assert.equal(await page.evaluate(() => window.submissions.length), 1)
      assert.deepEqual(errors, [])
      reports.push({engine: name, version: browser.version(), metadata_repair: true, manifest_repair: true,
        exact_byte_handoff: true, incomplete_refusal: true, keyboard_repair: true})
      console.log(JSON.stringify(reports.at(-1)))
    } finally {await browser.close()}
  }
} finally {
  await host.close()
  await writeFile(root + '/artifacts/reports/browser-repair.json', JSON.stringify(reports, null, 2) + '\n')
}
