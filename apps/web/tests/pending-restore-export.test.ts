import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import test from 'node:test'
import {chromium} from 'playwright'

test('pending local restore details can be downloaded without changing the record', async () => {
  const base = 'http://127.0.0.1:49374'
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {cwd:new URL('..',import.meta.url), env:{...process.env, HOST:'127.0.0.1', PORT:'49374', BSS_MODE:'standalone'}, stdio:'ignore'})
  let browser
  try {
    for (let attempt = 0; ; attempt++) {
      try {if ((await fetch(base)).ok) break} catch {}
      if (attempt === 100 || server.exitCode !== null) throw Error('Built app did not start')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    browser = await chromium.launch({headless:true})
    const page = await browser.newPage({acceptDownloads:true})
    let subject = 'alice'
    await page.route('**/api/local/session', route => route.fulfill({status:200, json:{issuer:'fixture',subject}}))
    await page.route('**/api/local/drafts', route => route.fulfill({status:200, json:{drafts:[],nextCursor:null}}))
    await page.goto(base)
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.getByRole('button',{name:'Download pending restore details'}).click({timeout:5000})
    await page.getByText('No pending local restore was found.').waitFor()
    assert.equal(await page.evaluate(async () => (await indexedDB.databases()).some(database => database.name === 'bijux-history-restores')),false)
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve,reject) => {const request = indexedDB.open('bijux-history-restores',2); request.onupgradeneeded = () => request.result.createObjectStore('attempts',{keyPath:'owner'}); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)})
      db.close()
    })
    await page.getByRole('button',{name:'Download pending restore details'}).click()
    await page.getByText('Pending restore details could not be downloaded. Preserve the original browser storage.').waitFor()
    assert.equal(await page.evaluate(async () => (await indexedDB.databases()).find(database => database.name === 'bijux-history-restores')?.version),2)
    await page.evaluate(async () => {await new Promise<void>((resolve,reject) => {const request = indexedDB.deleteDatabase('bijux-history-restores'); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error)})})
    const owner = JSON.stringify(['fixture','alice']), attempt = {key:'pending-key',draftId:'draft',expectedHead:'head',sourceVersion:'source'}
    await page.evaluate(async owner => {
      const db = await new Promise<IDBDatabase>((resolve,reject) => {const request = indexedDB.open('bijux-history-restores',1); request.onupgradeneeded = () => request.result.createObjectStore('attempts',{keyPath:'owner'}); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)})
      await new Promise<void>((resolve,reject) => {const tx = db.transaction('attempts','readwrite'); tx.objectStore('attempts').put({owner,attempt:{unknown:'preserve'}}); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error)})
      db.close()
    },owner)
    await page.getByRole('button',{name:'Download pending restore details'}).click()
    await page.getByText('Pending restore details could not be downloaded. Preserve the original browser storage.').waitFor()
    const invalidStored = await page.evaluate(async owner => {const db = await new Promise<IDBDatabase>((resolve,reject) => {const request = indexedDB.open('bijux-history-restores'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)}); const result = await new Promise<unknown>((resolve,reject) => {const req = db.transaction('attempts').objectStore('attempts').get(owner); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error)}); db.close(); return result},owner)
    assert.deepEqual(invalidStored,{owner,attempt:{unknown:'preserve'}})
    await page.evaluate(async ({owner,attempt}) => {
      const db = await new Promise<IDBDatabase>((resolve,reject) => {const request = indexedDB.open('bijux-history-restores',1); request.onupgradeneeded = () => request.result.createObjectStore('attempts',{keyPath:'owner'}); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)})
      await new Promise<void>((resolve,reject) => {const tx = db.transaction('attempts','readwrite'); tx.objectStore('attempts').put({owner,attempt}); tx.objectStore('attempts').put({owner:JSON.stringify(['fixture','bob']),attempt:{...attempt,key:'other-account'}}); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error)})
      db.close()
    }, {owner,attempt})
    const [download] = await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download pending restore details'}).click({timeout:5000})])
    const chunks:Buffer[] = []
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
    const value = JSON.parse(Buffer.concat(chunks).toString()) as {owner:string; attempt:typeof attempt; origin:string}
    assert.deepEqual(value.attempt,attempt); assert.equal(value.owner,owner); assert.equal(value.origin,base)
    const stored = await page.evaluate(async owner => {const db = await new Promise<IDBDatabase>((resolve,reject) => {const request = indexedDB.open('bijux-history-restores'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)}); const result = await new Promise<unknown>((resolve,reject) => {const req = db.transaction('attempts').objectStore('attempts').get(owner); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error)}); db.close(); return result},owner)
    assert.deepEqual(stored,{owner,attempt})
    let unexpectedDownloads = 0
    page.on('download', () => {unexpectedDownloads++})
    subject = 'bob'
    await page.getByRole('button',{name:'Download pending restore details'}).click()
    await page.getByText('The local account changed. Refresh the account before downloading.').waitFor()
    assert.equal(unexpectedDownloads,0)
  } finally {await browser?.close(); if (server.exitCode === null) {server.kill(); await new Promise<void>(resolve => server.once('exit',() => resolve()))}}
})
