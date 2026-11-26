import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile, mkdir, writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {resolve, extname} from 'node:path'
import {build} from 'vite'
import {chromium} from 'playwright'
import type {RecoveryStore} from '../src/drafts/recovery-store.js'

test('concurrent recovery writes use atomic revision preconditions', async () => {
  const root = resolve('../..'), output = resolve(root,'artifacts/web/recovery-harness')
  await mkdir(output,{recursive:true})
  const html = resolve(output,'index.html')
  await writeFile(html,'<!doctype html><script type="module" src="/apps/web/tests/recovery-store-harness.ts"></script>')
  await build({root,configFile:false,publicDir:false,logLevel:'error',build:{outDir:resolve(output,'dist'),emptyOutDir:true,rollupOptions:{input:html}}})
  const dist = resolve(output,'dist')
  const server = createServer(async (request,response) => {
    const path = resolve(dist,'.' + (request.url === '/' ? '/artifacts/web/recovery-harness/index.html' : request.url!.split('?')[0]))
    if (!path.startsWith(dist + '/')) {response.writeHead(403).end(); return}
    try {response.setHeader('Content-Type',extname(path) === '.js' ? 'text/javascript' : 'text/html'); response.end(await readFile(path))} catch {response.writeHead(404).end()}
  })
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw Error('server address')
  let browser
  try {
    browser = await chromium.launch({headless:true})
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${address.port}/`)
    const result = await page.evaluate(async () => {
      const store = (window as unknown as {recoveryStore:RecoveryStore}).recoveryStore
      const first = await store.save('shared',null,'first')
      const writes = await Promise.allSettled([store.save('shared',first.revision,'second'),store.save('shared',first.revision,'third')])
      const getAll = IDBObjectStore.prototype.getAll, openCursor = IDBObjectStore.prototype.openCursor, get = IDBObjectStore.prototype.get
      let records: Awaited<ReturnType<RecoveryStore['list']>> = []
      try {
        IDBObjectStore.prototype.getAll = () => {throw Error('Listing fetched backup bodies')}
        IDBObjectStore.prototype.openCursor = () => {throw Error('Listing fetched backup bodies')}
        IDBObjectStore.prototype.get = () => {throw Error('Listing fetched backup bodies')}
        records = await store.list()
      } finally {IDBObjectStore.prototype.getAll = getAll; IDBObjectStore.prototype.openCursor = openCursor; IDBObjectStore.prototype.get = get}
      const selected = await store.read('shared',records[0]!.revision)
      let stale = false
      try {await store.read('shared',first.revision)} catch {stale = true}
      return {states:writes.map(value => value.status).sort(),records,payload:selected.backup,stale}
    })
    assert.deepEqual(result.states,['fulfilled','rejected'])
    assert.equal(result.records.length,1)
    assert.equal(Object.hasOwn(result.records[0]!, 'backup'),false,'Listing copies must not load every full backup')
    assert.ok(['second','third'].includes(result.payload))
    assert.equal(result.stale,true)
    const legacyContext = await browser.newContext(), legacy = await legacyContext.newPage()
    const origin = `http://127.0.0.1:${address.port}`
    await legacy.goto(origin + '/seed')
    await legacy.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve,reject) => {const request = indexedDB.open('bijux-draft-recovery',1); request.onupgradeneeded = () => request.result.createObjectStore('drafts',{keyPath:'id'}); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)})
      await new Promise<void>((resolve,reject) => {const tx = db.transaction('drafts','readwrite'); tx.objectStore('drafts').put({id:'legacy',revision:7,savedAt:1,backup:'legacy bytes'}); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error)})
      db.close()
    })
    await legacy.goto(origin + '/')
    const upgraded = await legacy.evaluate(async () => {const store = (window as unknown as {recoveryStore:RecoveryStore}).recoveryStore; return {records:await store.list(),record:await store.read('legacy',7)}})
    assert.deepEqual(upgraded.records,[{id:'legacy',revision:7,savedAt:1}])
    assert.equal(upgraded.record.backup,'legacy bytes')
    await legacyContext.close()
  } finally {await browser?.close(); await new Promise<void>(resolve => server.close(() => resolve()))}
})
