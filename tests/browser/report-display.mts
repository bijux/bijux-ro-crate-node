import {selectedEngines} from '../support/selection.mjs'
import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {chromium, firefox, webkit} from 'playwright'
import {serve, root} from '../../scripts/http/server.mjs'

const host = await serve()
const results: Array<{engine: string; submitted_markup_inert: boolean; duplicate_findings_retained: number; visible_page: number}> = []
try {
  for (const [name, engine] of selectedEngines({chromium, firefox, webkit})) {
    const browser = await engine.launch({headless: true})
    try {
      const page = await browser.newPage()
      await page.addInitScript(() => {
        Reflect.set(window, 'Worker', class {
          declare onmessage?: (event: {data: unknown}) => void
          terminate() {}
          postMessage(request: Record<string, unknown>) {
            const issue = {message: '<img src=x onerror="window.injected=true">', severity: 40,
              location_description: '<script>window.injected=true</script>'}
            const result = {status: 'invalid', report: {highest_error_level: 'ERROR',
              issues: {CRITICAL: [], ERROR: Array.from({length: 1001}, () => ({...issue})), WARNING: [], INFO: [], DEBUG: []}}}
            queueMicrotask(() => this.onmessage?.({data: {...request, result}}))
          }
        })
      })
      await page.goto(host.origin + '/examples/submission/index.html')
      await page.getByLabel('Choose crate folder').setInputFiles(resolve(root, 'tests/parity/fixtures/test_minimal_valid_ro_crate'))
      await page.waitForFunction(() => document.querySelector<HTMLElement>('#result')!.dataset.state === 'invalid')
      assert.equal(await page.locator('#issues .issue').count(), 200)
      assert.match(await page.locator('#issues').innerText(), /Showing 200 of 1001/)
      assert.match(await page.locator('#issues').innerText(), /<img src=x/)
      assert.equal(await page.locator('#issues img, #issues script').count(), 0)
      assert.equal(await page.evaluate(() => Boolean((window as Window & {injected?: boolean}).injected)), false)
      const report = JSON.parse((await page.locator('#report-json').textContent())!)
      assert.equal(report.report.issues.ERROR.length, 1001)
      assert.equal(await page.locator('#continue').isDisabled(), true)
      results.push({engine: name, submitted_markup_inert: true, duplicate_findings_retained: 1001, visible_page: 200})
      console.log(JSON.stringify(results.at(-1)))
    } finally {await browser.close()}
  }
} finally {
  await host.close()
  await writeFile(root + '/artifacts/reports/browser-display.json', JSON.stringify(results, null, 2) + '\n')
}
