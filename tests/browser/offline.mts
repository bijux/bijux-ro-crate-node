import {selectedEngines} from '../support/selection.mjs'
import assert from 'node:assert/strict'
import {readFile, writeFile} from 'node:fs/promises'
import {chromium, firefox, webkit} from 'playwright'
import {serve, root} from '../../scripts/http/server.mjs'

const files = await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name =>
  [name, await readFile(new URL('../parity/fixtures/test_minimal_valid_ro_crate/' + name, import.meta.url), 'utf8')] as [string, string]))
const host = await serve()
const reports: Array<Record<string, unknown>> = []
try {
  for (const [name, engine] of selectedEngines({chromium, firefox, webkit})) {
    const browser = await engine.launch({headless: true})
    try {
      const context = await browser.newContext({serviceWorkers: 'block'})
      const unexpected: string[] = [], localBlobReads: string[] = []
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
          await new Promise<void>((resolve, reject) => {
            const deadline = setTimeout(() => reject(new Error('Read observer did not start')), 60000)
            worker.onmessage = ({data}) => {
              if (data.ready) {clearTimeout(deadline); resolve()}
            }
            worker.onerror = event => {clearTimeout(deadline); reject(new Error(event.message))}
          })
          const send = (id: number, entries: Array<[string, string]>, probeRead?: string) => new Promise<{result: {status: string}; reads: string[]; probeReadBlocked: boolean; reason: string}>((resolve, reject) => {
            // Retain source Blob handles until the worker completes their reads.
            const selected = new Map(entries.map(([path, text]) => [path, new File([text], path)]))
            const deadline = setTimeout(() => reject(new Error('Read observation timed out')), 60000)
            worker.onmessage = ({data}) => {clearTimeout(deadline); if (!selected.size) reject(new Error('Empty selection')); else resolve(data)}
            worker.onerror = event => {clearTimeout(deadline); reject(new Error(event.message))}
            worker.postMessage({session: 'offline-proof', revision: id, id, probeRead,
              files: selected})
          })
          const normal = await send(1, [...files, ['unrelated.tif', 'image payload']])
          const unknown = await send(2, [['ro-crate-metadata.json', JSON.stringify({
            '@context': 'http://127.0.0.1/private-context', '@graph': [],
          })]])
          const binaryProbe = await send(3, [...files, ['unrelated.tif', 'image payload']], 'unrelated.tif')
          const unregisteredProbe = await send(4, files, 'unregistered')
          return {normal, unknown, binaryProbe, unregisteredProbe}
        } finally {worker.terminate()}
      }, files)
      assert.equal(outputs.normal.result.status, 'valid', JSON.stringify({normal: outputs.normal, unexpected}))
      assert.ok(outputs.normal.reads.includes('ro-crate-metadata.json'))
      assert.ok(outputs.normal.reads.includes('file_list.tsv'))
      assert.ok(!outputs.normal.reads.includes('unrelated.tif'))
      assert.equal(outputs.unknown.result.status, 'incomplete')
      assert.equal(outputs.binaryProbe.probeReadBlocked, true)
      assert.match(outputs.binaryProbe.reason, /Unrelated image bytes/)
      assert.equal(outputs.unregisteredProbe.probeReadBlocked, true)
      assert.match(outputs.unregisteredProbe.reason, /Unregistered Blob bytes/)
      assert.deepEqual(unexpected, [])
      reports.push({engine: name, version: browser.version(), required_reads: outputs.normal.reads,
        unrelated_payload_unread: true, binary_read_negative_control: true, unregistered_read_negative_control: true, unknown_context_incomplete: true, unexpected_requests: unexpected, local_blob_reads: localBlobReads.length})
      console.log(JSON.stringify(reports.at(-1)))
    } finally {await browser.close()}
  }
} finally {
  await host.close()
  await writeFile(root + '/artifacts/reports/browser-offline.json', JSON.stringify(reports, null, 2) + '\n')
}
