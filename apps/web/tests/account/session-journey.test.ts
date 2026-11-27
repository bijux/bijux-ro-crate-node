import {once} from 'node:events'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {chromium} from 'playwright'
import {base, signIn, waitForCurrentRecovery, saveNewDraft, startServer} from './local-account-fixture.js'
import {request as httpRequest, createServer} from 'node:http'
import {RECOVERY_REQUEST_MAX_BYTES} from '../../src/server/recovery/admission.js'

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
    await waitForCurrentRecovery(page)
    await page.getByRole('button', {name:'Open saved local draft'}).click()
    await freshSeen
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    await page.getByLabel('Study title').fill('Edits made while opening')
    await waitForCurrentRecovery(page)
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
    await waitForCurrentRecovery(page)
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



test('account fixture refuses an occupied port without probing another server', async () => {
  let hits = 0
  const stranger = createServer((_request,response) => {hits++; response.end('unrelated')})
  stranger.listen(0,'127.0.0.1')
  await once(stranger,'listening')
  const address = stranger.address()
  assert.ok(address && typeof address !== 'string')
  try {
    await assert.rejects(startServer(true,address.port), /server.*(start|readiness)/i)
    assert.equal(hits,0)
    assert.equal(stranger.listening,true)
  } finally {await new Promise<void>((resolve,reject) => stranger.close(error => error ? reject(error) : resolve()))}
})
