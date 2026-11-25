import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { request as httpRequest } from 'node:http'
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
    await login.locator('#username').fill(username, {timeout:5000})
    await login.locator('#password').fill(password)
    await login.locator('#kc-login').click()
  } catch (error) {if (!login.isClosed()) throw error}
  await page.getByText('Signed in to the local reference.', {exact:false}).waitFor()
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
    await page.getByRole('button', {name:'Save local draft'}).click()
    await page.getByText('Local draft saved.', {exact:false}).waitFor()
    const options = page.locator('#account-draft option')
    assert.ok(await options.count() > 1)
    const savedId = await options.nth(1).getAttribute('value')
    assert.ok(savedId)
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
    await page.getByText('Signed in to the local reference.', {exact:false}).waitFor()
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
    await page.getByRole('button', {name:'Save local draft'}).click()
    await page.getByText('Local draft saved.', {exact:false}).waitFor()
    const savedId = await page.locator('#account-draft option').nth(1).getAttribute('value')
    assert.ok(savedId)
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
