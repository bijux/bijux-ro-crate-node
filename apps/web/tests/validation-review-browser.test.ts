import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {resolve, extname} from 'node:path'
import {build} from 'vite'
import vue from '@vitejs/plugin-vue'
import {chromium} from 'playwright'

test('reported untrusted findings and unknown locations remain text without invented links', async () => {
  const root = resolve('../..')
  const output = resolve(root, 'artifacts/web/review-harness')
  await mkdir(output, {recursive: true})
  const html = resolve(output, 'index.html')
  await writeFile(html, '<!doctype html><div id="app"></div><script type="module" src="/artifacts/web/review-harness/main.ts"></script>')
  await writeFile(resolve(output, 'main.ts'), `
import {createApp, h} from 'vue'
import ValidationPanel from '/apps/web/src/features/editor/validation/ValidationPanel.vue'
const issues = {CRITICAL: [], ERROR: [{message: '<img src=x onerror="window.injected=true">', severity: 40, location_description: 'Specimen: <a href="https://example.test">unknown</a>'}, {message: 'Unmapped record', severity: 40, location_description: 'specimen: specimen-123'}], WARNING: [], INFO: [], DEBUG: []}
createApp({render: () => h(ValidationPanel, {status: {state: 'invalid', eligible: false, result: {status: 'invalid', report: {highest_error_level: 'ERROR', issues}}}, listedPayload: 0, missingPayload: 0})}).mount('#app')
`)
  await build({root, plugins: [vue()], configFile: false, publicDir: false, logLevel: 'error', build: {outDir: resolve(output, 'dist'), emptyOutDir: true, rollupOptions: {input: html}}})
  const dist = resolve(output, 'dist')
  const server = createServer(async (request, response) => {
    const path = resolve(dist, '.' + (request.url === '/' ? '/artifacts/web/review-harness/index.html' : request.url!.split('?')[0]))
    if (!path.startsWith(dist + '/')) {response.writeHead(403).end(); return}
    try {const contents = await readFile(path); response.setHeader('Content-Type', extname(path) === '.js' ? 'text/javascript' : 'text/html'); response.end(contents)}
    catch {response.writeHead(404).end()}
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('server address')
  let browser
  try {
    browser = await chromium.launch({headless: true})
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${address.port}/`)
    const finding = page.locator('li').filter({hasText: '<img src=x onerror="window.injected=true">'})
    assert.equal(await finding.count(), 1)
    assert.equal(await finding.textContent(), '<img src=x onerror="window.injected=true"> — Specimen: <a href="https://example.test">unknown</a>')
    assert.equal(await finding.locator('a, img').count(), 0)
    const unmapped = page.locator('li').filter({hasText: 'Unmapped record'})
    assert.equal(await unmapped.textContent(), 'Unmapped record — specimen: specimen-123')
    assert.equal(await unmapped.locator('a').count(), 0)
    assert.equal(await page.evaluate(() => (window as unknown as {injected?: boolean}).injected), undefined)
  } finally {await browser?.close(); await new Promise<void>(resolve => server.close(() => resolve()))}
})
