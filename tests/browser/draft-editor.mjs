import assert from 'node:assert/strict'
import {cp, mkdir, readFile, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium, firefox, webkit} from 'playwright'
import {serve, root} from './host.mjs'

const source = resolve(root, 'tests/parity/fixtures/test_minimal_valid_ro_crate')
const fixture = resolve(root, 'artifacts/work/editor-read-crate')
await mkdir(fixture, {recursive: true})
await cp(source, fixture, {recursive: true})
const metadata = await readFile(resolve(source, 'ro-crate-metadata.json'), 'utf8')
const original = await readFile(resolve(source, 'file_list.tsv'), 'utf8')
const alternate = original + 'other.tif\t#missing-dataset\n'
await writeFile(resolve(fixture, 'other.tsv'), alternate)
const host = await serve()
const reports = []
try {
  for (const [name, engine] of Object.entries({chromium, firefox, webkit})) {
    const browser = await engine.launch({headless: true})
    try {
      const page = await browser.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.addInitScript(() => {
        const read = File.prototype.text
        let held = false
        File.prototype.text = async function () {
          const value = await read.call(this)
          if (this.name === 'file_list.tsv' && !held) {
            held = true
            return new Promise(resolve => {window.releaseManifestRead = () => resolve(value)})
          }
          return value
        }
      })
      await page.goto(host.origin + '/examples/submission/index.html')
      await page.getByLabel('Choose crate folder').setInputFiles(fixture)
      await page.waitForFunction(() => typeof window.releaseManifestRead === 'function')
      await page.locator('#manifest-path').selectOption('other.tsv')
      await page.waitForFunction(expected => document.querySelector('#manifest-editor').value === expected, alternate)
      await page.evaluate(async () => {window.releaseManifestRead(); await new Promise(requestAnimationFrame)})
      assert.equal(await page.locator('#manifest-editor').inputValue(), alternate)
      await page.locator('#manifest-path').selectOption('file_list.tsv')
      await page.waitForFunction(expected => document.querySelector('#manifest-editor').value === expected, original)
      const editedMetadata = JSON.stringify(JSON.parse(metadata)).replaceAll('file_list.tsv', 'other.tsv')
      await page.locator('#metadata-editor').fill(editedMetadata)
      await page.waitForFunction(() => document.querySelector('#manifest-path').value === 'other.tsv')
      await page.waitForFunction(expected => document.querySelector('#manifest-editor').value === expected, alternate)
      await page.locator('#manifest-editor').fill('')
      await page.locator('#manifest-path').selectOption('file_list.tsv')
      await page.waitForFunction(expected => document.querySelector('#manifest-editor').value === expected, original)
      await page.locator('#manifest-path').selectOption('other.tsv')
      await page.waitForFunction(() => !document.querySelector('#manifest-editor').disabled)
      assert.equal(await page.locator('#manifest-editor').inputValue(), '')
      await page.locator('#manifest-editor').fill(original)
      await page.waitForFunction(() => document.querySelector('#result').dataset.state === 'valid')
      await page.evaluate(() => {
        document.addEventListener('cratevalidated', event => {window.handedManifest = event.detail.files.get('other.tsv')}, {once: true})
      })
      await page.locator('#continue').click()
      assert.equal(await page.evaluate(() => window.handedManifest), original)
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted: true})))
      assert.equal(await page.locator('#continue').isDisabled(), true)
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true})))
      await page.waitForFunction(() => document.querySelector('#result').dataset.state === 'valid')
      assert.equal(await page.locator('#metadata-editor').inputValue(), editedMetadata)
      assert.equal(await page.locator('#manifest-editor').inputValue(), original)
      const escaped = JSON.stringify(JSON.parse(metadata)).replaceAll('file_list.tsv', 'file%ZZ.tsv')
      await page.locator('#file-picker').setInputFiles([
        {name: 'ro-crate-metadata.json', mimeType: 'application/json', buffer: Buffer.from(escaped)},
        {name: 'file%ZZ.tsv', mimeType: 'text/tab-separated-values', buffer: Buffer.from(original)},
      ])
      await page.waitForFunction(() => document.querySelector('#manifest-path').value === 'file%ZZ.tsv')
      await page.waitForFunction(() => document.querySelector('#result').dataset.state === 'valid')
      assert.equal(await page.locator('#manifest-editor').inputValue(), original)
      const metadataPage = await browser.newPage()
      metadataPage.on('pageerror', error => errors.push(error.message))
      await metadataPage.addInitScript(() => {
        const read = File.prototype.text
        window.holdNextMetadataRead = true
        File.prototype.text = async function () {
          const text = await read.call(this)
          if (this.name === 'ro-crate-metadata.json' && window.holdNextMetadataRead) {
            window.holdNextMetadataRead = false
            return new Promise(resolve => {window.releaseMetadataRead = () => resolve(text)})
          }
          return text
        }
      })
      try {
        await metadataPage.goto(host.origin + '/examples/submission/index.html')
        await metadataPage.getByLabel('Choose crate folder').setInputFiles(source)
        await metadataPage.waitForFunction(() => typeof window.releaseMetadataRead === 'function')
        await metadataPage.waitForFunction(() => document.querySelector('#result').dataset.state === 'valid')
        await metadataPage.locator('#validate-now').click()
        await metadataPage.waitForFunction(() => document.querySelector('#result').dataset.state === 'valid')
        await metadataPage.evaluate(() => window.releaseMetadataRead())
        await metadataPage.waitForFunction(() => !document.querySelector('#metadata-editor').disabled)
        assert.equal(await metadataPage.locator('#metadata-editor').inputValue(), metadata)
        await metadataPage.waitForFunction(expected => document.querySelector('#manifest-editor').value === expected, original)
        await metadataPage.evaluate(() => {window.holdNextMetadataRead = true; window.releaseMetadataRead = undefined})
        const selectedFiles = text => [
          {name: 'ro-crate-metadata.json', mimeType: 'application/json', buffer: Buffer.from(text)},
          {name: 'file_list.tsv', mimeType: 'text/tab-separated-values', buffer: Buffer.from(original)},
        ]
        await metadataPage.locator('#file-picker').setInputFiles(selectedFiles(metadata))
        await metadataPage.waitForFunction(() => typeof window.releaseMetadataRead === 'function')
        await metadataPage.locator('#file-picker').setInputFiles(selectedFiles('{}'))
        await metadataPage.waitForFunction(() => !document.querySelector('#metadata-editor').disabled)
        assert.equal(await metadataPage.locator('#metadata-editor').inputValue(), '{}')
        await metadataPage.evaluate(async () => {window.releaseMetadataRead(); await new Promise(requestAnimationFrame)})
        assert.equal(await metadataPage.locator('#metadata-editor').inputValue(), '{}')
        assert.equal(await metadataPage.locator('#continue').isDisabled(), true)
      } finally {await metadataPage.close()}
      for (const [declared, filename] of [
        ['./file_list.tsv', 'file_list.tsv'], ['./manifest.data', 'manifest.data'],
        ['./file%20list.data', 'file list.data'],
      ]) {
        const aliased = metadata.replaceAll('file_list.tsv', declared)
        await page.locator('#file-picker').setInputFiles([
          {name: 'ro-crate-metadata.json', mimeType: 'application/json', buffer: Buffer.from(aliased)},
          {name: filename, mimeType: 'text/tab-separated-values', buffer: Buffer.from(original)},
        ])
        await page.waitForFunction(path => document.querySelector('#manifest-path').value === path, filename)
        await page.waitForFunction(expected => document.querySelector('#manifest-editor').value === expected && !document.querySelector('#manifest-editor').disabled, original)
        await page.waitForFunction(() => document.querySelector('#result').dataset.state === 'valid')
      }
      assert.deepEqual(errors, [])
      reports.push({engine: name, stale_read_ignored: true, declared_path_followed: true,
        revalidation_during_metadata_read: true, stale_metadata_read_ignored: true,
        normalized_manifest_selection: true, nonstandard_manifest_extension: true,
        empty_overlay_repair: true, exact_manifest_handoff: true, tolerant_filename_selection: true, persisted_page_events: true})
      console.log(JSON.stringify(reports.at(-1)))
    } finally {await browser.close()}
  }
} finally {
  await host.close()
  await writeFile(resolve(root, 'artifacts/reports/draft-editor.json'), JSON.stringify(reports, null, 2) + '\n')
}
