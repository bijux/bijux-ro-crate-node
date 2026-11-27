import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { request as httpRequest } from 'node:http'
import { readFile } from 'node:fs/promises'
import { inspectDraft } from '@bijux/ro-crate-creator'
import { decodeRecovery } from '../src/drafts/recovery-codec.js'
import { RECOVERY_REQUEST_MAX_BYTES } from '../src/server/recovery/admission.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chromium, type BrowserContext, type Page } from 'playwright'

const base = 'http://127.0.0.1:14321'
async function signIn(page:Page, context:BrowserContext, username = 'researcher-a', password = 'local-a') {
  const popup = context.waitForEvent('page')
  await page.getByRole('button', {name:'Sign in locally'}).click()
  const login = await popup
  try {
    await login.locator('#username, #kc-attempted-username').first().waitFor({timeout:5000})
    if (await login.getByRole('button', {name:'Restart login'}).count()) await login.getByRole('button', {name:'Restart login'}).click()
    await login.locator('#username').fill(username, {timeout:5000})
    await login.locator('#password').fill(password)
    await login.locator('#kc-login').click()
  } catch (error) {if (!login.isClosed()) throw error}
  await page.getByText(/Signed in to the local reference|A previous save is waiting/).waitFor()
}
async function saveNewDraft(page: Page): Promise<string> {
  const saveResponse = page.waitForResponse(response => response.url().endsWith('/api/local/drafts') && response.request().method() === 'POST')
  await page.getByRole('button', {name:'Save local draft', exact:true}).click()
  const response = await saveResponse
  assert.equal(response.status(), 201)
  const {draftId} = await response.json() as {draftId:string}
  assert.ok(draftId)
  await page.getByText('Local draft saved.', {exact:false}).waitFor()
  await page.locator('#account-draft').locator(`option[value="${draftId}"]`).waitFor({state:'attached'})
  return draftId
}
async function startServer(enabled = true): Promise<ChildProcess> {
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {
    cwd:new URL('..', import.meta.url), env:{...process.env, HOST:'127.0.0.1', PORT:'14321', BIJUX_LOCAL_REFERENCE:enabled ? '1' : '0'}, stdio:'ignore',
  })
  for (let attempt = 0;; attempt++) {
    try {if ((await fetch(base)).ok) return server} catch {}
    if (attempt === 100 || server.exitCode !== null) {server.kill(); throw Error('Astro server did not start')}
    await new Promise(resolve => setTimeout(resolve,100))
  }
}

test('account saves and reopens unfinished vocabulary without marking later edits saved', async () => {
  const server = await startServer()
  const browser = await chromium.launch({headless:true})
  try {
    const context = await browser.newContext(), page = await context.newPage()
    await page.goto(base)
    await page.getByRole('button',{name:'Create study'}).click()
    const nav = page.locator('aside[aria-label="Study navigation"]')
    await nav.getByRole('link',{name:'Biosamples',exact:true}).click()
    await page.getByRole('button',{name:'Add biosample'}).click()
    const term = page.getByLabel('Add organism to biosample 1 label')
    await term.fill('Unfinished organism')
    await nav.getByRole('link',{name:'Local account'}).click()
    await signIn(page,context)
    const savedId = await saveNewDraft(page)
    const saved = await page.evaluate(async id => (await (await fetch(`/api/local/drafts/${id}`)).json()) as {recovery:{pendingTerms:Array<{label:string}>}; frozen:{status:string}}, savedId)
    assert.equal(saved.recovery.pendingTerms[0].label, 'Unfinished organism')
    assert.equal(saved.frozen.status, 'blocked')
    await nav.getByRole('link',{name:'Biosamples',exact:true}).click()
    await term.fill('Newer unfinished organism')
    await nav.getByRole('link',{name:'Local account'}).click()
    await page.getByText('Changes since the last local save remain unsaved.',{exact:true}).waitFor()
    await page.locator('#account-draft').selectOption(savedId)
    page.once('dialog', dialog => void dialog.accept())
    await page.getByRole('button',{name:'Open saved local draft'}).click()
    await page.getByText('Local draft opened.',{exact:false}).waitFor()
    await nav.getByRole('link',{name:'Biosamples',exact:true}).click()
    assert.equal(await term.inputValue(), 'Unfinished organism')
    await nav.getByRole('link',{name:'Local account'}).click()
    await page.locator('#account-draft').selectOption(savedId)
    let release!:() => void, entered!:() => void
    const held = new Promise<void>(resolve => {release = resolve}), reached = new Promise<void>(resolve => {entered = resolve})
    await page.route(`**/api/local/drafts/${savedId}`, async route => {const response = await route.fetch(); entered(); await held; await route.fulfill({response})}, {times:1})
    await page.getByRole('button',{name:'Open saved local draft'}).click(); await reached
    await nav.getByRole('link',{name:'Biosamples',exact:true}).click()
    await term.fill('Newer text during open')
    const confirmation = page.waitForEvent('dialog')
    release()
    const dialog = await confirmation
    assert.match(dialog.message(), /Replace the current study/)
    await dialog.dismiss()
    assert.equal(await term.inputValue(), 'Newer text during open')
    await context.close()
  } finally {await browser.close(); if (server.exitCode === null) {server.kill(); await once(server,'exit')}}
})

test('local account saves and reopens a draft while conflicts and expiry keep current edits', async () => {
  const server = await startServer()
  const browser = await chromium.launch({headless:true})
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    page.on('dialog', dialog => dialog.accept())
    await page.goto(base)
    await page.getByRole('button', {name:'Create study'}).click()
    await page.getByLabel('Study title').fill('Saved original')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Files',exact:true}).click()
    await page.getByLabel('List files',{exact:true}).setInputFiles({name:'image.tif',mimeType:'image/tiff',buffer:Buffer.from('image')})
    await page.getByText('1 pending assignment.',{exact:false}).waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await signIn(page, context)
    const savedId = await saveNewDraft(page)
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    await page.getByLabel('Study title').fill('Current unsaved')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.getByText('Changes since the last local save remain unsaved.', {exact:true}).waitFor()
    await page.locator('#account-draft').selectOption(savedId)
    await page.getByRole('button', {name:'Open saved local draft'}).click()
    await page.getByText('Local draft opened.', {exact:false}).waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Saved original')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Files',exact:true}).click()
    await page.getByText('1 pending assignment.',{exact:false}).waitFor()
    const second = await context.newPage()
    second.on('dialog', dialog => dialog.accept())
    await second.goto(`${base}/#account`)
    await second.getByText('Signed in to the local reference.', {exact:false}).waitFor()
    await second.locator('#account-draft').selectOption(savedId)
    await second.getByRole('button', {name:'Open saved local draft'}).click()
    await second.getByText('Local draft opened.', {exact:false}).waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    await page.getByLabel('Study title').fill('Winner')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.getByRole('button', {name:'Save local draft'}).click()
    await page.getByText('Local draft saved.', {exact:false}).waitFor()
    await second.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    await second.getByLabel('Study title').fill('Losing edits')
    await second.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await second.getByRole('button', {name:'Save local draft'}).click()
    await second.getByText('This saved draft changed.', {exact:false}).waitFor()
    await second.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    assert.equal(await second.getByLabel('Study title').inputValue(), 'Losing edits')
    await second.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Files',exact:true}).click()
    await second.getByText('1 pending assignment.',{exact:false}).waitFor()
    await second.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await second.getByRole('button', {name:'Discard pending account save'}).click()
    await second.getByText('Pending account save discarded.', {exact:false}).waitFor()
    const countBeforeExpiry = await page.evaluate(async () => (await (await fetch('/api/local/drafts')).json()).drafts.length as number)
    await page.evaluate(async () => {await fetch('/api/local/auth/logout', {method:'POST'})})
    await page.getByRole('button', {name:'Save local draft'}).click()
    await page.getByText('Your local session expired.', {exact:false}).waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Winner')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await signIn(page, context)
    await page.getByRole('button', {name:'Save local draft'}).click()
    await page.getByText('Local draft saved.', {exact:false}).waitFor()
    assert.equal(await page.evaluate(async () => (await (await fetch('/api/local/drafts')).json()).drafts.length as number), countBeforeExpiry)
    await context.close()
  } finally {
    await browser.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})

test('a lost save response is retried after reload without creating a second result', async () => {
  const server = await startServer()
  const browser = await chromium.launch({headless:true})
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(base)
    await page.getByRole('button', {name:'Create study'}).click()
    await page.getByLabel('Study title').fill('Snapshot before lost response')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await signIn(page, context)
    const countBefore = await page.evaluate(async () => (await (await fetch('/api/local/drafts')).json()).drafts.length as number)
    let drop = true
    await page.route('**/api/local/drafts', async route => {
      if (route.request().method() === 'POST' && drop) {drop = false; await route.fetch(); await route.abort('failed')}
      else await route.continue()
    })
    await page.getByRole('button', {name:'Save local draft'}).click()
    await page.getByText('The local account request could not be completed.', {exact:false}).waitFor()
    const stored = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {const r = indexedDB.open('bijux-account-attempts'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error)})
      const records = await new Promise<unknown[]>((resolve, reject) => {const r = db.transaction('attempts').objectStore('attempts').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error)})
      db.close(); return records.length
    })
    assert.equal(stored, 1)
    assert.equal(await page.evaluate(async () => (await (await fetch('/api/local/drafts')).json()).drafts.length as number), countBefore + 1)
    await page.unroute('**/api/local/drafts')
    await page.reload()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    await page.getByRole('button', {name:'Create study'}).click()
    await page.getByLabel('Study title').fill('New work after reload')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.getByText(/Signed in to the local reference|A previous save is waiting/).waitFor()
    await page.getByRole('button', {name:'Save local draft'}).click()
    await page.getByText('An earlier pending save was resolved.', {exact:false}).waitFor()
    assert.equal(await page.evaluate(async () => (await (await fetch('/api/local/drafts')).json()).drafts.length as number), countBefore + 1)
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'New work after reload')
    await context.close()
  } finally {
    await browser.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})

test('unconfigured editor does not enable local account routes', async () => {
  const server = await startServer(false)
  const browser = await chromium.launch({headless:true})
  try {
    const page = await browser.newPage()
    await page.goto(`${base}/#account`)
    await page.getByText('Local account service is not configured or is unavailable.', {exact:false}).waitFor()
    assert.equal(await page.getByRole('button', {name:'Sign in locally'}).count(), 0)
    assert.equal((await page.request.get(`${base}/api/local/session`)).status(), 404)
  } finally {
    await browser.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})

test('late account responses cannot restore a signed-out or changed principal', async () => {
  const server = await startServer()
  const browser = await chromium.launch({headless:true})
  try {
    const context = await browser.newContext(), page = await context.newPage()
    await page.goto(base)
    await page.getByRole('button', {name:'Create study'}).click()
    await page.getByLabel('Study title').fill('Saved for race')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await signIn(page, context)
    const savedId = await saveNewDraft(page)
    let releaseRefresh!: () => void, seenRefresh!: () => void
    const refreshGate = new Promise<void>(resolve => {releaseRefresh = resolve})
    const refreshSeen = new Promise<void>(resolve => {seenRefresh = resolve})
    await page.route('**/api/local/session', async route => {
      const response = await route.fetch(); seenRefresh(); await refreshGate; await route.fulfill({response})
    }, {times:1})
    await page.getByRole('button', {name:'Refresh saved drafts'}).click()
    await refreshSeen
    await page.getByRole('button', {name:'Sign out locally'}).click()
    await page.getByText('Signed out locally.', {exact:false}).waitFor()
    releaseRefresh()
    await page.getByRole('button', {name:'Sign in locally'}).waitFor()
    await page.waitForTimeout(250)
    assert.equal(await page.getByRole('button', {name:'Save local draft'}).count(), 0)
    await page.unroute('**/api/local/session')
    await signIn(page, context)
    await page.locator('#account-draft').selectOption(savedId)
    let releaseFresh!: () => void, seenFresh!: () => void
    const freshGate = new Promise<void>(resolve => {releaseFresh = resolve})
    const freshSeen = new Promise<void>(resolve => {seenFresh = resolve})
    await page.route(`**/api/local/drafts/${savedId}`, async route => {
      const response = await route.fetch(); seenFresh(); await freshGate; await route.fulfill({response})
    }, {times:1})
    await page.getByRole('button', {name:'Open saved local draft'}).click()
    await freshSeen
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    await page.getByLabel('Study title').fill('Edits made while opening')
    const confirmation = page.waitForEvent('dialog')
    releaseFresh()
    const dialog = await confirmation
    assert.match(dialog.message(), /Replace the current study/)
    await dialog.dismiss()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Edits made while opening')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.getByText('The current work remains open.', {exact:true}).waitFor()
    await page.locator('#account-draft').selectOption(savedId)
    let releaseOpen!: () => void, seenOpen!: () => void
    const openGate = new Promise<void>(resolve => {releaseOpen = resolve})
    const openSeen = new Promise<void>(resolve => {seenOpen = resolve})
    await page.route(`**/api/local/drafts/${savedId}`, async route => {
      const response = await route.fetch(); seenOpen(); await openGate; await route.fulfill({response})
    }, {times:1})
    await page.getByRole('button', {name:'Open saved local draft'}).click()
    await openSeen
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    await page.getByLabel('Study title').fill('Newer work in flight')
    const other = await browser.newContext(), otherPage = await other.newPage()
    await otherPage.goto(`${base}/#account`)
    await signIn(otherPage, other, 'researcher-b', 'local-b')
    const otherCookie = (await other.cookies(base)).find(cookie => cookie.name === 'draft_session')
    assert.ok(otherCookie)
    await context.addCookies([otherCookie])
    releaseOpen()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.getByText('The local account changed.', {exact:false}).waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Newer work in flight')
    await other.close()
    await context.close()
  } finally {
    await browser.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})

async function streamedSave(cookie?: string, overflow = false): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false
    const request = httpRequest(`${base}/api/local/drafts`, {
      method:'POST', headers:{origin:base, 'content-type':'application/json', 'transfer-encoding':'chunked', ...(cookie ? {cookie} : {})},
    }, response => {
      response.resume(); settled = true; clearTimeout(timer); resolve(response.statusCode ?? 0); request.destroy()
    })
    const timer = setTimeout(() => {request.destroy(); reject(Error('Stream was not rejected promptly'))}, 30000)
    request.on('error', error => {if (!settled) {clearTimeout(timer); reject(error)}})
    request.flushHeaders()
    if (overflow) {
      const chunk = Buffer.alloc(1024 * 1024, 0x20)
      let remaining = RECOVERY_REQUEST_MAX_BYTES + 1
      const send = () => {
        while (!settled && remaining > 0) {
          const bytes = Math.min(remaining, chunk.length); remaining -= bytes
          if (!request.write(chunk.subarray(0, bytes))) {request.once('drain', send); return}
        }
        if (!settled) request.end()
      }
      send()
    }
  })
}

test('built Astro rejects unauthenticated and oversized streams without consuming unbounded input', async () => {
  const server = await startServer()
  const browser = await chromium.launch({headless:true})
  try {
    assert.equal(await streamedSave(), 401)
    const context = await browser.newContext(), page = await context.newPage()
    await page.goto(`${base}/#account`)
    await signIn(page, context)
    const cookies = await context.cookies(base)
    assert.equal(await streamedSave(cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '), true), 413)
    await context.close()
  } finally {
    await browser.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})

test('a save response cannot bind an old account after the session changes', async () => {
  const server = await startServer()
  const browser = await chromium.launch({headless:true})
  try {
    const first = await browser.newContext(), page = await first.newPage()
    await page.goto(base)
    await page.getByRole('button', {name:'Create study'}).click()
    await page.getByLabel('Study title').fill('Work retained across account change')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await signIn(page, first)
    let release!: () => void, seen!: () => void
    const gate = new Promise<void>(resolve => {release = resolve}), responseSeen = new Promise<void>(resolve => {seen = resolve})
    await page.route('**/api/local/drafts', async route => {
      if (route.request().method() !== 'POST') {await route.continue(); return}
      const response = await route.fetch(); seen(); await gate; await route.fulfill({response})
    }, {times:1})
    await page.getByRole('button', {name:'Save local draft'}).click()
    await responseSeen
    const second = await browser.newContext(), secondPage = await second.newPage()
    await secondPage.goto(`${base}/#account`)
    await signIn(secondPage, second, 'researcher-b', 'local-b')
    const otherCookie = (await second.cookies(base)).find(cookie => cookie.name === 'draft_session')
    assert.ok(otherCookie)
    await first.addCookies([otherCookie])
    release()
    await page.getByText('The local account changed.', {exact:false}).waitFor()
    assert.equal(await page.getByRole('button', {name:'Save local draft'}).count(), 0)
    const pending = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {const r = indexedDB.open('bijux-account-attempts'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error)})
      const records = await new Promise<unknown[]>((resolve, reject) => {const r = db.transaction('attempts').objectStore('attempts').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error)})
      db.close(); return records.length
    })
    assert.equal(pending, 1)
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Work retained across account change')
    await second.close(); await first.close()
  } finally {
    await browser.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})

test('a saved local draft can be reopened after Astro and browser restart', async () => {
  let server = await startServer()
  let browser = await chromium.launch({headless:true})
  try {
    const first = await browser.newContext(), page = await first.newPage()
    await page.goto(base)
    await page.getByRole('button', {name:'Create study'}).click()
    await page.getByLabel('Study title').fill('Durable after restart')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await signIn(page, first)
    const savedId = await saveNewDraft(page)
    await browser.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
    server = await startServer()
    browser = await chromium.launch({headless:true})
    const reopened = await browser.newContext(), next = await reopened.newPage()
    next.on('dialog', dialog => dialog.accept())
    await next.goto(`${base}/#account`)
    await signIn(next, reopened)
    await next.locator('#account-draft').selectOption(savedId)
    await next.getByRole('button', {name:'Open saved local draft'}).click()
    await next.getByText('Local draft opened.', {exact:false}).waitFor()
    await next.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    assert.equal(await next.getByLabel('Study title').inputValue(), 'Durable after restart')
    await reopened.close()
  } finally {
    await browser.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})

test('a rejected older save survives reload and can be downloaded before explicit discard', async () => {
  const server = await startServer()
  const browser = await chromium.launch({headless:true})
  try {
    const first = await browser.newContext({acceptDownloads:true}), page = await first.newPage()
    await page.goto(base)
    await page.getByRole('button', {name:'Create study'}).click()
    await page.getByLabel('Study title').fill('Initial saved work')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await signIn(page, first)
    const savedId = await saveNewDraft(page)
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    await page.getByLabel('Study title').fill('Older pending snapshot')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.route('**/api/local/drafts', route => route.request().method() === 'POST' ? route.abort('failed') : route.continue(), {times:1})
    await page.getByRole('button', {name:'Save local draft'}).click()
    await page.getByText('The local account request could not be completed.', {exact:false}).waitFor()
    await page.getByRole('button', {name:'Download pending save backup'}).waitFor()
    const second = await browser.newContext(), other = await second.newPage()
    other.on('dialog', dialog => dialog.accept())
    await other.goto(`${base}/#account`)
    await signIn(other, second)
    await other.locator('#account-draft').selectOption(savedId)
    await other.getByRole('button', {name:'Open saved local draft'}).click()
    await other.getByText('Local draft opened.', {exact:false}).waitFor()
    await other.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    await other.getByLabel('Study title').fill('New server head')
    await other.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await other.getByRole('button', {name:'Save local draft'}).click()
    await other.getByText('Local draft saved.', {exact:false}).waitFor()
    await page.reload()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    await page.getByRole('button', {name:'Create study'}).click()
    await page.getByLabel('Study title').fill('Newer current work')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.getByText('A previous save is waiting.', {exact:false}).waitFor()
    await page.getByRole('button', {name:'Save local draft'}).click()
    await page.getByText('This saved draft changed.', {exact:false}).waitFor()
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', {name:'Download pending save backup'}).click()
    const download = await downloadEvent
    assert.equal(download.suggestedFilename(), 'pending-account-save.json')
    const path = await download.path()
    assert.ok(path)
    const decoded = await decodeRecovery(await readFile(path, 'utf8'))
    assert.equal(decoded.status, 'decoded')
    if (decoded.status !== 'decoded') throw Error('expected editable recovery')
    assert.equal(inspectDraft(decoded.draft).study?.name, 'Older pending snapshot')
    const cancel = page.waitForEvent('dialog')
    await page.getByRole('button', {name:'Discard pending account save'}).click()
    await (await cancel).dismiss()
    assert.equal(await page.getByRole('button', {name:'Download pending save backup'}).count(), 1)
    const confirm = page.waitForEvent('dialog')
    await page.getByRole('button', {name:'Discard pending account save'}).click()
    await (await confirm).accept()
    await page.getByText('Pending account save discarded.', {exact:false}).waitFor()
    await page.getByRole('button', {name:'Save local draft'}).click()
    await page.getByText('Local draft saved.', {exact:false}).waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Newer current work')
    await second.close(); await first.close()
  } finally {
    await browser.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})

test('conflict comparison preserves retained, current and confirmed head with explicit recovery choices', async () => {
  const server = await startServer()
  const browser = await chromium.launch({headless:true})
  try {
    const first = await browser.newContext({acceptDownloads:true}), page = await first.newPage()
    await page.goto(base)
    await page.getByRole('button', {name:'Create study'}).click()
    await page.getByLabel('Study title').fill('Comparison base')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await signIn(page, first)
    const id = await saveNewDraft(page)
    const saved = await page.evaluate(async draftId => (await (await fetch(`/api/local/drafts/${draftId}`)).json()) as {versionId:string; savedAt:string}, id)
    await page.getByText(saved.versionId, {exact:false}).first().waitFor()
    await page.getByText(saved.savedAt, {exact:false}).first().waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    await page.getByLabel('Study title').fill('Retained older work')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Files',exact:true}).click()
    await page.getByLabel('List files',{exact:true}).setInputFiles({name:'retained.tif',mimeType:'image/tiff',buffer:Buffer.from('image')})
    await page.getByText('1 pending assignment.',{exact:false}).waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Biosamples',exact:true}).click()
    await page.getByRole('button',{name:'Add biosample'}).click()
    await page.getByLabel('Add organism to biosample 1 label').fill('Retained unfinished organism')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.route('**/api/local/drafts', route => route.request().method() === 'POST' ? route.abort('failed') : route.continue(), {times:1})
    await page.getByRole('button', {name:'Save local draft'}).click()
    await page.getByText('The local account request could not be completed.', {exact:false}).waitFor()
    const second = await browser.newContext(), other = await second.newPage()
    other.on('dialog', dialog => dialog.accept())
    await other.goto(`${base}/#account`); await signIn(other, second)
    await other.locator('#account-draft').selectOption(id)
    await other.getByRole('button', {name:'Open saved local draft'}).click()
    await other.getByText('Local draft opened.', {exact:false}).waitFor()
    await other.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    await other.getByLabel('Study title').fill('Server head one')
    await other.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Files',exact:true}).click()
    await other.getByLabel('List files',{exact:true}).setInputFiles({name:'server.tif',mimeType:'image/tiff',buffer:Buffer.from('image')})
    await other.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await other.getByRole('button', {name:'Save local draft'}).click()
    await other.getByText('Local draft saved.', {exact:false}).waitFor()
    const head = await page.evaluate(async draftId => (await (await fetch(`/api/local/drafts/${draftId}`)).json()) as {versionId:string; savedAt:string}, id)
    await page.reload()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    await page.getByRole('button', {name:'Create study'}).click()
    await page.getByLabel('Study title').fill('Newer current work')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Files',exact:true}).click()
    await page.getByLabel('List files',{exact:true}).setInputFiles({name:'current.tif',mimeType:'image/tiff',buffer:Buffer.from('image')})
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.getByText('A previous save is waiting.', {exact:false}).waitFor()
    await page.getByRole('button', {name:'Save local draft'}).click()
    await page.getByText('This saved draft changed.', {exact:false}).waitFor()
    let releaseCompare!: () => void, seenCompare!: () => void
    const compareGate = new Promise<void>(resolve => {releaseCompare = resolve})
    const compareSeen = new Promise<void>(resolve => {seenCompare = resolve})
    await page.route(`**/api/local/drafts/${id}`, async route => {
      const response = await route.fetch(); seenCompare(); await compareGate; await route.fulfill({response})
    }, {times:1})
    await page.getByRole('button', {name:'Compare retained save'}).click()
    await compareSeen
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    await page.getByLabel('Study title').fill('Newer current work edited')
    releaseCompare()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.getByText('The account or current work changed. Compare again', {exact:false}).waitFor()
    assert.equal(await page.getByRole('heading', {name:'Compare the retained save'}).count(), 0)
    await page.getByRole('button', {name:'Compare retained save'}).click()
    await page.getByText('Comparison ready.', {exact:false}).waitFor()
    await page.getByText(head.versionId, {exact:false}).first().waitFor()
    await page.getByText(head.savedAt, {exact:false}).first().waitFor()
    await page.getByText(/Retained older work.*Newer current work edited/).waitFor()
    await page.getByText(/Retained older work.*Server head one/).waitFor()
    await page.getByText(/retained\.tif/).first().waitFor()
    await page.getByText(/current\.tif/).first().waitFor()
    await page.getByText(/server\.tif/).first().waitFor()
    await page.getByText('Other pending input is included in the full backups.').first().waitFor()
    const currentDownload = page.waitForEvent('download')
    await page.getByRole('button', {name:'Download current work backup'}).click()
    const currentPath = await (await currentDownload).path(); assert.ok(currentPath)
    const current = await decodeRecovery(await readFile(currentPath, 'utf8'))
    assert.equal(current.status, 'decoded')
    if (current.status !== 'decoded') throw Error('expected current recovery')
    assert.equal(inspectDraft(current.draft).study?.name, 'Newer current work edited')
    assert.equal(current.pending[0].path, 'current.tif')
    const headDownload = page.waitForEvent('download')
    await page.getByRole('button', {name:'Download confirmed server backup'}).click()
    const headPath = await (await headDownload).path(); assert.ok(headPath)
    const headBackup = await decodeRecovery(await readFile(headPath, 'utf8'))
    assert.equal(headBackup.status, 'decoded')
    if (headBackup.status !== 'decoded') throw Error('expected head recovery')
    assert.equal(inspectDraft(headBackup.draft).study?.name, 'Server head one')
    assert.equal(headBackup.pending[0].path, 'server.tif')
    await other.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    await other.getByLabel('Study title').fill('Server head two')
    await other.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await other.getByRole('button', {name:'Save local draft'}).click()
    await other.getByText('Local draft saved.', {exact:false}).waitFor()
    const staleConfirm = page.waitForEvent('dialog')
    const staleConfirmClick = page.getByRole('button', {name:'Open confirmed server revision'}).click()
    await (await staleConfirm).accept()
    await staleConfirmClick
    await page.getByText('The current work remains open. Compare again', {exact:false}).waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Newer current work edited')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.getByRole('button', {name:'Compare retained save'}).click()
    await page.getByText(/Retained older work.*Server head two/).waitFor()
    const headConfirm = page.waitForEvent('dialog')
    const headConfirmClick = page.getByRole('button', {name:'Open confirmed server revision'}).click()
    await (await headConfirm).accept()
    await headConfirmClick
    await page.getByText('Confirmed revision', {exact:false}).last().waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Server head two')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.getByRole('button', {name:'Compare retained save'}).click()
    await page.getByText('Comparison ready.', {exact:false}).waitFor()
    const recoverConfirm = page.waitForEvent('dialog')
    const recoverConfirmClick = page.getByRole('button', {name:'Recover retained save as new local draft'}).click()
    await (await recoverConfirm).accept()
    await recoverConfirmClick
    await page.getByText('Retained save recovered as a new local draft.', {exact:false}).waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Retained older work')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Files',exact:true}).click()
    await page.getByText('1 pending assignment.',{exact:false}).waitFor()
    await page.getByText('retained.tif',{exact:true}).first().waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Biosamples',exact:true}).click()
    assert.equal(await page.getByLabel('Add organism to biosample 1 label').inputValue(), 'Retained unfinished organism')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.getByRole('button', {name:'Compare retained save'}).click()
    await page.getByText('Comparison ready.', {exact:false}).waitFor()
    const idsBeforeCopy = await page.evaluate(async () => ((await (await fetch('/api/local/drafts')).json()).drafts as Array<{draftId:string}>).map(draft => draft.draftId))
    const copyConfirm = page.waitForEvent('dialog')
    const copyConfirmClick = page.getByRole('button', {name:'Save current work as a copy'}).click()
    await (await copyConfirm).accept()
    await copyConfirmClick
    await page.getByText('Local draft saved.', {exact:false}).waitFor()
    const idsAfterCopy = await page.evaluate(async () => ((await (await fetch('/api/local/drafts')).json()).drafts as Array<{draftId:string}>).map(draft => draft.draftId))
    const added = idsAfterCopy.filter(draftId => !idsBeforeCopy.includes(draftId))
    assert.equal(added.length, 1)
    assert.notEqual(added[0], id)
    const copy = await page.evaluate(async draftId => (await (await fetch(`/api/local/drafts/${draftId}`)).json()) as {recovery:{pendingTerms:Array<{label:string}>};frozen:{status:string}}, added[0])
    assert.equal(copy.recovery.pendingTerms[0].label, 'Retained unfinished organism')
    assert.equal(copy.frozen.status, 'blocked')
    await first.close(); await second.close()
  } finally {
    await browser.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})

test('saving work loaded under another account requires explicit copy consent', async () => {
  const server = await startServer()
  const browser = await chromium.launch({headless:true})
  try {
    const first = await browser.newContext(), page = await first.newPage()
    await page.goto(base)
    await page.getByRole('button', {name:'Create study'}).click()
    await page.getByLabel('Study title').fill('Original account work')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await signIn(page, first)
    await page.getByRole('button', {name:'Save local draft'}).click()
    await page.getByText('Local draft saved.', {exact:false}).waitFor()
    const second = await browser.newContext(), other = await second.newPage()
    await other.goto(`${base}/#account`); await signIn(other, second, 'researcher-b', 'local-b')
    const cookie = (await second.cookies(base)).find(item => item.name === 'draft_session'); assert.ok(cookie)
    await first.addCookies([cookie])
    await page.getByRole('button', {name:'Refresh saved drafts'}).click()
    await page.getByText('Signed in to the local reference.', {exact:false}).waitFor()
    const count = await page.evaluate(async () => (await (await fetch('/api/local/drafts')).json()).drafts.length as number)
    const cancel = page.waitForEvent('dialog', {timeout:5000})
    const click = page.getByRole('button', {name:'Save local draft'}).click()
    const dialog = await cancel
    assert.match(dialog.message(), /different local account/)
    await dialog.dismiss(); await click
    assert.equal(await page.evaluate(async () => (await (await fetch('/api/local/drafts')).json()).drafts.length as number), count)
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Original account work')
    await first.close(); await second.close()
  } finally {
    await browser.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})

test('a comparison response from a prior principal cannot replace current state', async () => {
  const server = await startServer()
  const browser = await chromium.launch({headless:true})
  try {
    const first = await browser.newContext(), page = await first.newPage()
    await page.goto(base)
    await page.getByRole('button', {name:'Create study'}).click()
    await page.getByLabel('Study title').fill('Principal-bound work')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await signIn(page, first)
    const id = await saveNewDraft(page)
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    await page.getByLabel('Study title').fill('Retained principal work')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.route('**/api/local/drafts', route => route.request().method() === 'POST' ? route.abort('failed') : route.continue(), {times:1})
    await page.getByRole('button', {name:'Save local draft'}).click()
    await page.getByText('The local account request could not be completed.', {exact:false}).waitFor()
    let release!: () => void, seen!: () => void
    const gate = new Promise<void>(resolve => {release = resolve}), requestSeen = new Promise<void>(resolve => {seen = resolve})
    await page.route(`**/api/local/drafts/${id}`, async route => {
      const response = await route.fetch(); seen(); await gate; await route.fulfill({response})
    }, {times:1})
    await page.getByRole('button', {name:'Compare retained save'}).click()
    await requestSeen
    const second = await browser.newContext(), other = await second.newPage()
    await other.goto(`${base}/#account`); await signIn(other, second, 'researcher-b', 'local-b')
    const cookie = (await second.cookies(base)).find(item => item.name === 'draft_session'); assert.ok(cookie)
    await first.addCookies([cookie]); release()
    await page.getByText('The local account changed.', {exact:false}).waitFor()
    assert.equal(await page.getByRole('heading', {name:'Compare the retained save'}).count(), 0)
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Retained principal work')
    const count = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>(resolve => {const r = indexedDB.open('bijux-account-attempts'); r.onsuccess = () => resolve(r.result)})
      const rows = await new Promise<unknown[]>(resolve => {const r = db.transaction('attempts').objectStore('attempts').getAll(); r.onsuccess = () => resolve(r.result)})
      db.close(); return rows.length
    })
    assert.equal(count, 1)
    await first.close(); await second.close()
  } finally {
    await browser.close()
    if (server.exitCode === null) {server.kill(); await once(server, 'exit')}
  }
})

test('recovered retained work requires consent before saving under another account', async () => {
  const server = await startServer()
  const browser = await chromium.launch({headless:true})
  try {
    const first = await browser.newContext(), page = await first.newPage()
    await page.goto(base)
    await page.getByRole('button', {name:'Create study'}).click()
    await page.getByLabel('Study title').fill('Retained account work')
    const nav = page.locator('aside[aria-label="Study navigation"]')
    await nav.getByRole('link', {name:'Local account'}).click()
    await signIn(page, first)
    await page.route('**/api/local/drafts', route => route.request().method() === 'POST' ? route.abort('failed') : route.continue(), {times:1})
    await page.getByRole('button', {name:'Save local draft', exact:true}).click()
    await page.getByText('The local account request could not be completed.', {exact:false}).waitFor()
    await page.getByRole('button', {name:'Compare retained save'}).click()
    await page.getByText('Comparison ready.', {exact:false}).waitFor()
    page.once('dialog', dialog => void dialog.accept())
    await page.getByRole('button', {name:'Recover retained save as new local draft'}).click()
    await page.getByText('Retained save recovered as a new local draft.', {exact:false}).waitFor()
    const second = await browser.newContext(), other = await second.newPage()
    await other.goto(`${base}/#account`)
    await signIn(other, second, 'researcher-b', 'local-b')
    const cookie = (await second.cookies(base)).find(item => item.name === 'draft_session'); assert.ok(cookie)
    await first.addCookies([cookie])
    await page.getByRole('button', {name:'Refresh saved drafts'}).click()
    await page.getByText('Signed in to the local reference.', {exact:false}).waitFor()
    const count = await page.evaluate(async () => (await (await fetch('/api/local/drafts')).json()).drafts.length as number)
    const confirmation = page.waitForEvent('dialog', {timeout:5000})
    const save = page.getByRole('button', {name:'Save local draft', exact:true}).click()
    const dialog = await confirmation
    assert.match(dialog.message(), /different local account/)
    await dialog.dismiss(); await save
    assert.equal(await page.evaluate(async () => (await (await fetch('/api/local/drafts')).json()).drafts.length as number), count)
    await nav.getByRole('link', {name:'Study details'}).click()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Retained account work')
    await first.close(); await second.close()
  } finally {await browser.close(); if (server.exitCode === null) {server.kill(); await once(server, 'exit')}}
})
