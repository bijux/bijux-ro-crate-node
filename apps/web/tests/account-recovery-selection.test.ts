import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {test} from 'node:test'
import {chromium} from 'playwright'
import {applyChange, createDraft} from '@bijux/ro-crate-creator'
import {encodeRecovery} from '../src/drafts/recovery-codec.js'

const base = 'http://127.0.0.1:49375'
const id = '00000000-0000-0000-0000-000000000001'
test('replacement selections supersede account opens while downloads leave them pending', async () => {
  let draft = createDraft()
  for (const change of [{type:'add-study'}, {type:'set-field',entityId:'./',field:'name',value:'Older account draft'}] as const) {
    const result = applyChange(draft, change)
    if (result.status !== 'applied') throw Error('Could not create the account draft fixture')
    draft = result.draft
  }
  const recovery = JSON.parse(encodeRecovery({draft,pending:[]})) as unknown
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {cwd:new URL('..', import.meta.url), env:{...process.env, HOST:'127.0.0.1', PORT:'49375', BSS_MODE:'standalone', BIJUX_LOCAL_REFERENCE:'1', NODE_ENV:'development'}, stdio:'ignore'})
  let browser
  try {
    for (let attempt = 0;; attempt++) {
      try {if ((await fetch(base)).ok) break} catch {}
      if (attempt === 100 || server.exitCode !== null) throw Error('Built app did not start')
      await new Promise(resolve => setTimeout(resolve,100))
    }
    browser = await chromium.launch({headless:true})
    const page = await browser.newPage()
    let release!:() => void, entered!:() => void, first = true, confirmations = 0
    const held = new Promise<void>(resolve => {release = resolve}), reached = new Promise<void>(resolve => {entered = resolve})
    await page.route('**/api/local/session', route => route.fulfill({status:200,json:{issuer:'fixture',session:'a'.repeat(64),subject:'alice'}}))
    await page.route('**/api/local/drafts', route => route.fulfill({status:200,json:{drafts:[{draftId:id,versionId:id,savedAt:'2025-01-01T00:00:00Z'}],nextCursor:null}}))
    await page.route(`**/api/local/drafts/${id}`, async route => {if (first) {first = false; entered(); await held} await route.fulfill({status:200,json:{versionId:id,savedAt:'2025-01-01T00:00:00Z',recovery}})})
    page.on('dialog', dialog => {confirmations++; void dialog.accept()})
    await page.goto(base)
    await page.getByRole('button', {name:'Create study'}).click()
    await page.getByLabel('Study title').fill('Current working study')
    const nav = (name:string) => page.locator('aside[aria-label="Study navigation"]').getByRole('link', {name,exact:true}).click()
    await nav('Local account')
    await page.locator(`#account-draft option[value="${id}"]`).waitFor({state:'attached'})
    await page.locator('#account-draft').selectOption(id)
    await page.getByRole('button', {name:'Open saved local draft'}).click()
    await reached
    await nav('Local recovery')
    await page.getByLabel('Import metadata files').setInputFiles({name:'ro-crate-metadata.json',mimeType:'application/json',buffer:Buffer.from('{"@context":"https://example.com/unsupported","@graph":[]}')})
    await page.getByText('This backup is read-only:', {exact:false}).waitFor()
    release()
    await nav('Local account')
    await page.getByText('A newer recovery selection started.', {exact:false}).waitFor()
    assert.equal(confirmations, 0)
    await nav('Local recovery')
    await page.getByText('This backup is read-only:', {exact:false}).waitFor()
    assert.equal(await page.getByRole('button', {name:'Download read-only backup'}).count(), 1)
    await nav('Study details')
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Current working study')
    let releaseNext!:() => void, reachedNext!:() => void
    const heldNext = new Promise<void>(resolve => {releaseNext = resolve}), enteredNext = new Promise<void>(resolve => {reachedNext = resolve})
    await page.unroute(`**/api/local/drafts/${id}`)
    await page.route(`**/api/local/drafts/${id}`, async route => {reachedNext(); await heldNext; await route.fulfill({status:200,json:{versionId:id,savedAt:'2025-01-01T00:00:00Z',recovery}})})
    await nav('Local account')
    await page.locator('#account-draft').selectOption(id)
    await page.getByRole('button', {name:'Open saved local draft'}).click()
    await enteredNext
    await nav('Local recovery')
    await page.getByText('Recovery copy saved in this browser.', {exact:false}).first().waitFor()
    await page.getByLabel('Available recovery copy').locator('option:not([value=""])').first().waitFor({state:'attached'})
    const savedId = await page.getByLabel('Available recovery copy').locator('option:not([value=""])').first().getAttribute('value')
    if (!savedId) throw Error('Recovery copy unavailable')
    await page.getByLabel('Available recovery copy').selectOption(savedId)
    await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name:'Download selected copy'}).click()])
    await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name:'Download editable backup'}).click()])
    await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name:'Download read-only backup'}).click()])
    releaseNext()
    await nav('Local account')
    await page.getByText('Local draft opened.', {exact:false}).waitFor()
    assert.equal(confirmations, 1)
    await nav('Study details')
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Older account draft')
  } finally {
    await browser?.close()
    if (server.exitCode === null) {const stopped = once(server,'exit'); server.kill(); await stopped}
  }
})

test('stale account errors cannot hide newer recovery choices and real session loss still clears identity', async () => {
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {cwd:new URL('..', import.meta.url), env:{...process.env, HOST:'127.0.0.1', PORT:'49375', BSS_MODE:'standalone', BIJUX_LOCAL_REFERENCE:'1', NODE_ENV:'development'}, stdio:'ignore'})
  let browser
  try {
    for (let attempt = 0;; attempt++) {
      try {if ((await fetch(base)).ok) break} catch {}
      if (attempt === 100 || server.exitCode !== null) throw Error('Built app did not start')
      await new Promise(resolve => setTimeout(resolve,100))
    }
    browser = await chromium.launch({headless:true})
    for (const scenario of ['server-failure', 'stale-auth', 'session-expired', 'account-changed', 'confirmation-unavailable'] as const) {
      const context = await browser.newContext(), page = await context.newPage()
      let release!:() => void, entered!:() => void, changed = false
      const held = new Promise<void>(resolve => {release = resolve}), reached = new Promise<void>(resolve => {entered = resolve})
      await page.route('**/api/local/session', route => {
        if (changed && scenario === 'session-expired') return route.fulfill({status:401})
        if (changed && scenario === 'confirmation-unavailable') return route.fulfill({status:503})
        return route.fulfill({status:200,json:{issuer:'fixture',session:'a'.repeat(64),subject:changed && scenario === 'account-changed' ? 'bob' : 'alice'}})
      })
      await page.route('**/api/local/drafts', route => route.fulfill({status:200,json:{drafts:[{draftId:id,versionId:id,savedAt:'2025-01-01T00:00:00Z'}],nextCursor:null}}))
      await page.route(`**/api/local/drafts/${id}`, async route => {entered(); await held; await route.fulfill({status:scenario === 'server-failure' ? 500 : 401})})
      await page.goto(base)
      await page.getByRole('button', {name:'Create study'}).click()
      await page.getByLabel('Study title').fill('Work remains open')
      const nav = (name:string) => page.locator('aside[aria-label="Study navigation"]').getByRole('link', {name,exact:true}).click()
      await nav('Local account')
      await page.locator(`#account-draft option[value="${id}"]`).waitFor({state:'attached'})
      await page.locator('#account-draft').selectOption(id)
      await page.getByRole('button', {name:'Open saved local draft'}).click()
      await reached
      await nav('Local recovery')
      await page.getByLabel('Import metadata files').setInputFiles({name:'ro-crate-metadata.json',mimeType:'application/json',buffer:Buffer.from('{"@context":"https://example.com/unsupported","@graph":[]}')})
      await page.getByText('This backup is read-only:', {exact:false}).waitFor()
      changed = true; release()
      await nav('Local account')
      const expected = scenario === 'session-expired' ? 'Your local session expired.' : scenario === 'account-changed' ? 'The local account changed.' : scenario === 'confirmation-unavailable' ? 'The local session could not be confirmed.' : 'A newer recovery selection started.'
      await page.getByText(expected, {exact:false}).waitFor()
      if (scenario === 'session-expired' || scenario === 'account-changed' || scenario === 'confirmation-unavailable') assert.equal(await page.getByRole('button', {name:'Sign in locally'}).count(), 1)
      else assert.equal(await page.getByRole('button', {name:'Open saved local draft'}).count(), 1)
      await nav('Local recovery')
      await page.getByText('This backup is read-only:', {exact:false}).waitFor()
      await nav('Study details')
      assert.equal(await page.getByLabel('Study title').inputValue(), 'Work remains open')
      await context.close()
    }
  } finally {
    await browser?.close()
    if (server.exitCode === null) {const stopped = once(server,'exit'); server.kill(); await stopped}
  }
})

test('a delayed pending-save lookup cannot replace a newer recovery selection', async () => {
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {cwd:new URL('..', import.meta.url), env:{...process.env, HOST:'127.0.0.1', PORT:'49375', BSS_MODE:'standalone', BIJUX_LOCAL_REFERENCE:'1', NODE_ENV:'development'}, stdio:'ignore'})
  let browser
  try {
    for (let attempt = 0;; attempt++) {
      try {if ((await fetch(base)).ok) break} catch {}
      if (attempt === 100 || server.exitCode !== null) throw Error('Built app did not start')
      await new Promise(resolve => setTimeout(resolve,100))
    }
    browser = await chromium.launch({headless:true})
    const page = await browser.newPage()
    await page.route('**/api/local/session', route => route.fulfill({status:200,json:{issuer:'fixture',session:'a'.repeat(64),subject:'alice'}}))
    await page.route('**/api/local/drafts', route => route.fulfill({status:200,json:{drafts:[{draftId:id,versionId:id,savedAt:'2025-01-01T00:00:00Z'}],nextCursor:null}}))
    await page.goto(base)
    const nav = (name:string) => page.locator('aside[aria-label="Study navigation"]').getByRole('link', {name,exact:true}).click()
    await nav('Local account')
    await page.locator(`#account-draft option[value="${id}"]`).waitFor({state:'attached'})
    await page.addScriptTag({content:`
      void (async () => {
        const database = await new Promise((resolve,reject) => {
          const request = indexedDB.open('bijux-account-attempts', 1)
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
        })
        const owner = JSON.stringify(['fixture','alice'])
        const transaction = database.transaction('attempts', 'readwrite'), store = transaction.objectStore('attempts')
        store.put({owner,attempt:{key:'pending',recovery:'{}'}})
        const state = {started:false, released:false}
        window.pendingLookupGate = state
        const pump = () => {const request = store.get(owner); request.onsuccess = () => {if (!state.released) pump()}}
        pump()
        const original = IDBDatabase.prototype.transaction
        IDBDatabase.prototype.transaction = function (...args) {
          if (this.name === 'bijux-account-attempts' && args[1] === 'readonly') state.started = true
          return original.apply(this,args)
        }
      })()
    `})
    await page.waitForFunction(() => !!(window as unknown as {pendingLookupGate?:unknown}).pendingLookupGate)
    await page.locator('#account-draft').selectOption(id)
    await page.getByRole('button', {name:'Open saved local draft'}).click()
    await page.waitForFunction(() => (window as unknown as {pendingLookupGate:{started:boolean}}).pendingLookupGate.started)
    await nav('Local recovery')
    await page.getByLabel('Import metadata files').setInputFiles({name:'ro-crate-metadata.json',mimeType:'application/json',buffer:Buffer.from('{"@context":"https://example.com/unsupported","@graph":[]}')})
    await page.getByText('This backup is read-only:', {exact:false}).waitFor()
    await page.evaluate(() => {(window as unknown as {pendingLookupGate:{released:boolean}}).pendingLookupGate.released = true})
    await nav('Local account')
    await page.getByText('A newer recovery selection started.', {exact:false}).waitFor()
    await nav('Local recovery')
    await page.getByText('This backup is read-only:', {exact:false}).waitFor()
  } finally {
    await browser?.close()
    if (server.exitCode === null) {const stopped = once(server,'exit'); server.kill(); await stopped}
  }
})
