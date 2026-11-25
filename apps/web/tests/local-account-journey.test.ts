import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chromium, type BrowserContext, type Page } from 'playwright'

const base = 'http://127.0.0.1:14321'
async function signIn(page:Page, context:BrowserContext) {
  const popup = context.waitForEvent('page')
  await page.getByRole('button', {name:'Sign in locally'}).click()
  const login = await popup
  try {
    await login.locator('#username').fill('researcher-a', {timeout:5000})
    await login.locator('#password').fill('local-a')
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
    await page.evaluate(async () => {await fetch('/api/local/auth/logout', {method:'POST'})})
    await page.getByRole('button', {name:'Save local draft'}).click()
    await page.getByText('Your local session expired.', {exact:false}).waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Winner')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await signIn(page, context)
    await page.getByRole('button', {name:'Save local draft'}).click()
    await page.getByText('Local draft saved.', {exact:false}).waitFor()
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
