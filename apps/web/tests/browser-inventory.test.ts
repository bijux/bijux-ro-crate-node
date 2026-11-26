import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile, mkdir, writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {resolve, extname} from 'node:path'
import {build} from 'vite'
import {chromium} from 'playwright'
import type {inventoryBrowserStorage} from '../src/drafts/browser-inventory.js'

test('browser storage inventory counts known stores without creating or modifying them', async () => {
  const root = resolve('../..'), output = resolve(root, 'artifacts/web/inventory-harness')
  await mkdir(output, {recursive:true})
  const html = resolve(output, 'index.html')
  await writeFile(html, '<!doctype html><script type="module" src="/apps/web/tests/browser-inventory-harness.ts"></script>')
  await build({root, configFile:false, publicDir:false, logLevel:'error', build:{outDir:resolve(output, 'dist'), emptyOutDir:true, rollupOptions:{input:html}}})
  const dist = resolve(output, 'dist')
  const server = createServer(async (request, response) => {
    const path = resolve(dist, '.' + (request.url === '/' ? '/artifacts/web/inventory-harness/index.html' : request.url!.split('?')[0]))
    if (!path.startsWith(dist + '/')) {response.writeHead(403).end(); return}
    try {response.setHeader('Content-Type', extname(path) === '.js' ? 'text/javascript' : 'text/html'); response.end(await readFile(path))} catch {response.writeHead(404).end()}
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw Error('server address')
  let browser
  try {
    browser = await chromium.launch({headless:true})
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${address.port}/`)
    const result = await page.evaluate(async () => {
      const inventory = (window as unknown as {inventoryBrowserStorage:typeof inventoryBrowserStorage}).inventoryBrowserStorage
      const empty = await inventory(indexedDB)
      const before = await indexedDB.databases()
      let unsupported = false
      try {await inventory({} as IDBFactory)} catch {unsupported = true}
      const listing = Promise.resolve([{name:'bijux-draft-recovery',version:1}])
      const vanished = {databases:listing.then.bind(listing), open:indexedDB.open.bind(indexedDB)} as IDBFactory
      let disappeared = false
      try {await inventory(vanished)} catch {disappeared = true}
      const afterVanished = await indexedDB.databases()
      const invalid = await new Promise<IDBDatabase>((resolve, reject) => {const req = indexedDB.open('bijux-history-restores', 1); req.onupgradeneeded = () => req.result.createObjectStore('unexpected'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error)})
      invalid.close()
      let invalidSchema = false
      try {await inventory(indexedDB)} catch {invalidSchema = true}
      await new Promise<void>((resolve, reject) => {const req = indexedDB.deleteDatabase('bijux-history-restores'); req.onsuccess = () => resolve(); req.onerror = () => reject(req.error)})
      for (const [name, store, key] of [['bijux-draft-recovery','drafts','id'], ['bijux-account-attempts','attempts','owner'], ['bijux-history-restores','attempts','owner']]) {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {const req = indexedDB.open(name, 1); req.onupgradeneeded = () => req.result.createObjectStore(store, {keyPath:key}); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error)})
        await new Promise<void>((resolve, reject) => {const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put({[key]:'example', value:'keep exactly'}); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error)})
        db.close()
      }
      const get = IDBObjectStore.prototype.get, getAll = IDBObjectStore.prototype.getAll, cursor = IDBObjectStore.prototype.openCursor
      let found:Awaited<ReturnType<typeof inventoryBrowserStorage>>
      try {
        IDBObjectStore.prototype.get = () => {throw Error('Inventory read a stored value')}
        IDBObjectStore.prototype.getAll = () => {throw Error('Inventory read stored values')}
        IDBObjectStore.prototype.openCursor = () => {throw Error('Inventory read stored values')}
        found = await inventory(indexedDB)
      } finally {IDBObjectStore.prototype.get = get; IDBObjectStore.prototype.getAll = getAll; IDBObjectStore.prototype.openCursor = cursor}
      const db = await new Promise<IDBDatabase>((resolve, reject) => {const req = indexedDB.open('bijux-account-attempts'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error)})
      const saved = await new Promise<unknown>((resolve, reject) => {const req = db.transaction('attempts').objectStore('attempts').get('example'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error)})
      db.close()
      return {empty, before, unsupported, disappeared, afterVanished, invalidSchema, found, saved}
    })
    assert.deepEqual(result.empty, {recovery:null, pendingSaves:null, pendingRestores:null})
    assert.deepEqual(result.before, [])
    assert.equal(result.unsupported, true)
    assert.equal(result.disappeared, true)
    assert.deepEqual(result.afterVanished, [])
    assert.equal(result.invalidSchema, true)
    assert.deepEqual(result.found, {recovery:1, pendingSaves:1, pendingRestores:1})
    assert.deepEqual(result.saved, {owner:'example', value:'keep exactly'})
  } finally {await browser?.close(); await new Promise<void>(resolve => server.close(() => resolve()))}
})
