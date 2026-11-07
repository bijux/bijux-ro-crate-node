import assert from 'node:assert/strict'
import {readFile, writeFile} from 'node:fs/promises'
import {chromium, firefox, webkit} from 'playwright'
import {serve, root} from './host.mjs'

const files = await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name =>
  [name, await readFile(new URL('../parity/fixtures/test_minimal_valid_ro_crate/' + name, import.meta.url), 'utf8')]))
const host = await serve()
const reports = []
try {
  for (const [name, engine] of Object.entries({chromium, firefox, webkit})) {
    const browser = await engine.launch({headless: true})
    try {
      const context = await browser.newContext({serviceWorkers: 'block'})
      const unexpected = [], localBlobReads = []
      await context.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.protocol === 'blob:' && url.origin === host.origin) {
          localBlobReads.push(url.href)
          return route.continue()
        }
        if (url.origin !== host.origin || !/^\/(?:examples\/submission\/|packages\/(?:core|validator)\/dist\/|tests\/browser\/observe-worker.js)/.test(url.pathname)) {
          unexpected.push(url.href)
          return route.abort()
        }
        return route.continue()
      })
      const page = await context.newPage()
      await page.goto(host.origin + '/examples/submission/index.html')
      const outputs = await page.evaluate(async files => {
        const worker = new Worker('/tests/browser/observe-worker.js', {type: 'module'})
        try {
          const send = (id, entries) => new Promise((resolve, reject) => {
            // Retain source Blob handles until the worker completes their reads.
            const selected = new Map(entries.map(([path, text]) => [path, new File([text], path)]))
            worker.onmessage = ({data}) => {if (!selected.size) reject(new Error('Empty selection')); else resolve(data)}
            worker.onerror = event => reject(new Error(event.message))
            worker.postMessage({session: 'offline-proof', revision: id, id,
              files: selected})
          })
          const normal = await send(1, [...files, ['unrelated.tif', 'image payload']])
          const unknown = await send(2, [['ro-crate-metadata.json', JSON.stringify({
            '@context': 'http://127.0.0.1/private-context', '@graph': [],
          })]])
          return {normal, unknown}
        } finally {worker.terminate()}
      }, files)
      assert.equal(outputs.normal.result.status, 'valid', JSON.stringify({normal: outputs.normal, unexpected}))
      assert.ok(outputs.normal.reads.includes('ro-crate-metadata.json'))
      assert.ok(outputs.normal.reads.includes('file_list.tsv'))
      assert.ok(!outputs.normal.reads.includes('unrelated.tif'))
      assert.equal(outputs.unknown.result.status, 'incomplete')
      assert.deepEqual(unexpected, [])
      reports.push({engine: name, version: browser.version(), required_reads: outputs.normal.reads,
        unrelated_payload_unread: true, unknown_context_incomplete: true, unexpected_requests: unexpected, local_blob_reads: localBlobReads.length})
      console.log(JSON.stringify(reports.at(-1)))
    } finally {await browser.close()}
  }
} finally {
  await host.close()
  await writeFile(root + '/artifacts/reports/browser-offline.json', JSON.stringify(reports, null, 2) + '\n')
}
