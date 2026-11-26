import { spawn } from 'node:child_process'
import { request } from 'node:http'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chromium } from 'playwright'

const base = 'http://127.0.0.1:14322'
test('built local history inspects and restores revisions while conflicts retain edits', async () => {
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {cwd:new URL('..', import.meta.url), env:{...process.env, HOST:'127.0.0.1', PORT:'14322', BIJUX_LOCAL_REFERENCE:'1', BIJUX_LOCAL_WEB_PORT:'14322', BIJUX_LOCAL_IDENTITY_PORT:'18082', BIJUX_LOCAL_DATABASE_PORT:'15436'}, stdio:'ignore'})
  const browser = await chromium.launch({headless:true})
  try {
    for (let attempt = 0; ; attempt++) {try {if ((await fetch(base)).ok) break} catch {} if (attempt === 100 || server.exitCode !== null) throw Error('Astro did not start'); await new Promise(resolve => setTimeout(resolve,100))}
    const forged = await new Promise<number | undefined>((resolve, reject) => {const req = request(`${base}/api/local/session`, {headers:{host:'evil.example'}}, res => {res.resume(); resolve(res.statusCode)}); req.on('error', reject); req.end()})
    assert.equal(forged, 400)
    const context = await browser.newContext(), page = await context.newPage()
    page.on('dialog', dialog => dialog.accept())
    await page.goto(base)
    await page.getByRole('button',{name:'Create study'}).click()
    await page.getByLabel('Study title').fill('First title')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.getByText('Sign in to use the local reference.',{exact:false}).waitFor()
    const popup = context.waitForEvent('page'); await page.getByRole('button',{name:'Sign in locally'}).click(); const login = await popup
    await login.locator('#username').fill('researcher-a'); await login.locator('#password').fill('local-a'); await login.locator('#kc-login').click()
    await page.getByText('Signed in to the local reference.',{exact:false}).waitFor()
    const initialSave = page.waitForResponse(result => result.url().endsWith('/api/local/drafts') && result.request().method() === 'POST')
    await page.getByRole('button',{name:'Save local draft',exact:true}).click(); const saved = await initialSave
    assert.equal(saved.status(), 201); const {draftId:draft} = await saved.json() as {draftId:string}
    await page.locator('#account-draft option').filter({hasText:draft.slice(0,8)}).waitFor({state:'attached'})
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click(); await page.getByLabel('Study title').fill('Second title')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Files',exact:true}).click(); await page.getByLabel('List files',{exact:true}).setInputFiles({name:'old-image.tif',mimeType:'image/tiff',buffer:Buffer.from('image')})
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click(); const saving = page.waitForResponse(result => result.url().endsWith('/api/local/drafts') && result.request().method() === 'POST'); await page.getByRole('button',{name:'Save local draft',exact:true}).click(); assert.equal((await saving).status(), 201); await page.getByRole('button',{name:'Save local draft',exact:true}).waitFor({state:'visible'})
    await page.locator('#history-draft').selectOption(draft)
    await page.locator('#history-version option').nth(2).waitFor({state:'attached'})
    const older = await page.locator('#history-version option').nth(2).getAttribute('value'); assert.ok(older)
    await page.locator('#history-version').selectOption(older)
    await page.getByText('Study: First title').waitFor()
    const other = await browser.newContext(), otherPage = await other.newPage()
    await otherPage.goto(`${base}/api/local/auth/login`); await otherPage.locator('#username').fill('researcher-b'); await otherPage.locator('#password').fill('local-b'); await otherPage.locator('#kc-login').click(); await otherPage.waitForURL(`${base}/api/local/auth/callback*`)
    assert.equal((await other.request.get(`${base}/api/local/drafts/${draft}/versions`)).status(), 404)
    assert.equal((await other.request.get(`${base}/api/local/drafts/${draft}/versions/${older}/backup`)).status(), 404)
    assert.equal((await other.request.get(`${base}/api/local/drafts/${draft}/versions/${older}/files`)).status(), 404)
    assert.equal((await other.request.post(`${base}/api/local/drafts/${draft}/restore`, {headers:{origin:base},data:{key:'other',expectedHead:older,sourceVersion:older}})).status(), 404)
    await other.close()
    const downloading = page.waitForEvent('download'); await page.getByRole('button',{name:'Download historical backup'}).click(); const backup = await downloading
    assert.equal(backup.suggestedFilename(), 'draft-backup.json')
    assert.equal((await readFile((await backup.path())!)).toString(), await page.evaluate(async ({draft, older}) => (await fetch(`/api/local/drafts/${draft}/versions/${older}/backup`)).text(), {draft, older}))
    const frozen = await page.evaluate(async ({draft, older}) => (await (await fetch(`/api/local/drafts/${draft}/versions/${older}/files`)).json()) as {status:string; files?:Array<{path:string; base64:string}>}, {draft, older})
    assert.equal(frozen.status, 'materialized'); assert.ok(frozen.files?.length)
    const metadata = frozen.files[0], download = page.waitForEvent('download')
    await page.getByRole('button',{name:`Download ${metadata.path}`}).click()
    assert.deepEqual(await readFile((await (await download).path())!), Buffer.from(metadata.base64, 'base64'))
    const newer = await page.locator('#history-version option').nth(1).getAttribute('value'); assert.ok(newer)
    await page.locator('#history-compare').selectOption(newer)
    await page.getByText('Study: Second title').waitFor(); await page.getByText('old-image.tif',{exact:true}).waitFor()
    const restoredResponse = page.waitForResponse(result => result.url().endsWith('/restore') && result.request().method() === 'POST')
    await page.getByRole('button',{name:'Restore selected version'}).click(); assert.equal((await restoredResponse).status(), 201)
    await page.getByText('Revision restored as a new saved version.',{exact:false}).waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'First title')
    await page.getByLabel('Study title').fill('Unsaved conflict work')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.locator('#history-draft').selectOption(draft); await page.locator('#history-version option').nth(2).waitFor({state:'attached'})
    await page.locator('#history-version').selectOption(older); await page.getByText('Study: First title').waitFor()
    const competing = await page.evaluate(async ({draft}) => {
      const head = await (await fetch(`/api/local/drafts/${draft}`)).json() as {versionId:string; recovery:unknown}
      return (await fetch('/api/local/drafts', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:crypto.randomUUID(),draftId:draft,expectedHead:head.versionId,recovery:head.recovery})})).status
    }, {draft}); assert.equal(competing, 201)
    await page.getByRole('button',{name:'Restore selected version'}).click(); await page.getByText('The saved draft changed.',{exact:false}).waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click(); assert.equal(await page.getByLabel('Study title').inputValue(), 'Unsaved conflict work')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    const refreshed = page.waitForResponse(result => result.url().endsWith('/api/local/drafts') && result.request().method() === 'GET')
    await page.getByRole('button',{name:'Refresh saved drafts'}).click(); await refreshed
    await page.locator('#history-draft').selectOption(draft); await page.locator('#history-version option').nth(2).waitFor({state:'attached'})
    await page.locator('#history-version').selectOption(older); await page.getByText('Study: First title').waitFor()
    let drop = true
    await page.route('**/restore', async route => {if (drop) {drop = false; await route.fetch(); await route.abort('failed')} else await route.continue()})
    await page.getByRole('button',{name:'Restore selected version'}).click(); await page.getByText('Restore could not be completed.',{exact:false}).waitFor()
    const count = async () => page.evaluate(async draft => ((await (await fetch(`/api/local/drafts/${draft}/versions`)).json()) as {versions:unknown[]}).versions.length, draft)
    const afterLost = await count()
    await page.getByRole('button',{name:'Restore selected version'}).click(); await page.getByText('Revision restored as a new saved version.',{exact:false}).waitFor()
    assert.equal(await count(), afterLost)
    await page.unroute('**/restore')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click(); await page.getByLabel('Study title').fill('Protected selection work')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    const refreshedAgain = page.waitForResponse(result => result.url().endsWith('/api/local/drafts') && result.request().method() === 'GET')
    await page.getByRole('button',{name:'Refresh saved drafts'}).click(); await refreshedAgain
    await page.locator('#history-draft').selectOption(draft); await page.locator('#history-version option').nth(2).waitFor({state:'attached'})
    await page.locator('#history-version').selectOption(older); await page.getByText('Study: First title').waitFor()
    for (const selection of ['comparison', 'version', 'draft'] as const) {
      let releaseSelection!:() => void, selectionEntered!:() => void
      const selectionHeld = new Promise<void>(resolve => {releaseSelection = resolve}), selectionReached = new Promise<void>(resolve => {selectionEntered = resolve})
      await page.route('**/restore', async route => {const result = await route.fetch(); selectionEntered(); await selectionHeld; await route.fulfill({response:result})})
      await page.getByRole('button',{name:'Restore selected version'}).click(); await selectionReached
      if (selection === 'comparison') {await page.locator('#history-compare').selectOption(newer); await page.getByText('Study: Second title').waitFor()}
      if (selection === 'version') {await page.locator('#history-version').selectOption(newer); await page.getByText('Study: Second title').waitFor()}
      if (selection === 'draft') {
        await page.locator('#history-draft').selectOption('')
        await page.locator('#history-draft').selectOption(draft); await page.locator('#history-version option').nth(2).waitFor({state:'attached'})
        await page.locator('#history-version').selectOption(older); await page.getByText('Study: First title').waitFor()
      }
      const automaticRefresh = page.waitForResponse(result => result.url().endsWith('/api/local/drafts') && result.request().method() === 'GET')
      releaseSelection(); await automaticRefresh
      await page.waitForFunction(() => {const button = Array.from(document.querySelectorAll('button')).find(item => item.textContent?.includes('Restore selected version')); return !!button && !button.disabled}, null, {timeout:5000})
      await page.unroute('**/restore')
      await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click(); assert.equal(await page.getByLabel('Study title').inputValue(), 'Protected selection work')
      await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
      const refreshedAfterSelection = page.waitForResponse(result => result.url().endsWith('/api/local/drafts') && result.request().method() === 'GET')
      await page.getByRole('button',{name:'Refresh saved drafts'}).click(); await refreshedAfterSelection
      await page.locator('#history-draft').selectOption(draft)
      await page.locator('#history-version option').nth(2).waitFor({state:'attached'})
      await page.locator('#history-version').selectOption(older); await page.getByText('Study: First title').waitFor()
    }
    let release!:() => void, entered!:() => void
    const held = new Promise<void>(resolve => {release = resolve}), reached = new Promise<void>(resolve => {entered = resolve})
    await page.route('**/restore', async route => {const result = await route.fetch(); entered(); await held; await route.fulfill({response:result})})
    await page.getByRole('button',{name:'Restore selected version'}).click(); await reached
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click(); await page.getByLabel('Study title').fill('Newer work during restore')
    release(); await page.waitForTimeout(200)
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Newer work during restore')
    await page.unroute('**/restore')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    const beforeOwnerRestore = page.waitForResponse(result => result.url().endsWith('/api/local/drafts') && result.request().method() === 'GET')
    await page.getByRole('button',{name:'Refresh saved drafts'}).click(); await beforeOwnerRestore
    await page.locator('#history-draft').selectOption(draft); await page.locator('#history-version option').nth(2).waitFor({state:'attached'})
    await page.locator('#history-version').selectOption(older); await page.getByText('Study: First title').waitFor()
    const replacement = await browser.newContext(), replacementPage = await replacement.newPage()
    await replacementPage.goto(`${base}/api/local/auth/login`); await replacementPage.locator('#username').fill('researcher-b'); await replacementPage.locator('#password').fill('local-b'); await replacementPage.locator('#kc-login').click(); await replacementPage.waitForURL(`${base}/api/local/auth/callback*`)
    let releaseOwner!:() => void, ownerReached!:() => void
    const ownerHeld = new Promise<void>(resolve => {releaseOwner = resolve}), ownerSent = new Promise<void>(resolve => {ownerReached = resolve})
    await page.route('**/restore', async route => {const result = await route.fetch(); ownerReached(); await ownerHeld; await route.fulfill({response:result})})
    await page.getByRole('button',{name:'Restore selected version'}).click(); await ownerSent
    assert.equal(await page.getByRole('button',{name:'Save local draft',exact:true}).isDisabled(), true)
    await context.addCookies(await replacement.cookies(base))
    const sessionCheck = page.waitForResponse(result => result.url().endsWith('/api/local/session') && result.status() === 200)
    releaseOwner(); await sessionCheck
    await page.getByText('Signed in to the local reference.',{exact:false}).waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Newer work during restore')
    await page.unroute('**/restore'); await replacement.close()
  } finally {await browser.close(); if (server.exitCode === null) {server.kill(); await once(server,'exit')}}
})

test('history summarizes and restores unfinished vocabulary from the selected saved revision', async () => {
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {cwd:new URL('..', import.meta.url), env:{...process.env, HOST:'127.0.0.1', PORT:'14322', BIJUX_LOCAL_REFERENCE:'1', BIJUX_LOCAL_WEB_PORT:'14322', BIJUX_LOCAL_IDENTITY_PORT:'18082', BIJUX_LOCAL_DATABASE_PORT:'15436'}, stdio:'ignore'})
  const browser = await chromium.launch({headless:true})
  try {
    for (let attempt = 0; ; attempt++) {try {if ((await fetch(base)).ok) break} catch {} if (attempt === 100 || server.exitCode !== null) throw Error('Astro did not start'); await new Promise(resolve => setTimeout(resolve,100))}
    const context = await browser.newContext(), page = await context.newPage()
    page.on('dialog', dialog => dialog.accept())
    await page.goto(base); await page.getByRole('button',{name:'Create study'}).click()
    await page.getByLabel('Description',{exact:true}).fill('Earlier description')
    const nav = page.locator('aside[aria-label="Study navigation"]')
    await nav.getByRole('link',{name:'Biosamples',exact:true}).click(); await page.getByRole('button',{name:'Add biosample'}).click()
    const term = page.getByLabel('Add organism to biosample 1 label'); await term.fill('Historical unfinished organism')
    await nav.getByRole('link',{name:'Local account'}).click(); await page.getByText('Sign in to use the local reference.',{exact:false}).waitFor()
    const popup = context.waitForEvent('page'); await page.getByRole('button',{name:'Sign in locally'}).click(); const login = await popup
    await login.locator('#username').fill('researcher-a'); await login.locator('#password').fill('local-a'); await login.locator('#kc-login').click(); await page.getByText('Signed in to the local reference.',{exact:false}).waitFor()
    const first = page.waitForResponse(result => result.url().endsWith('/api/local/drafts') && result.request().method() === 'POST')
    await page.getByRole('button',{name:'Save local draft',exact:true}).click(); const saved = await first; assert.equal(saved.status(),201)
    const {draftId,versionId} = await saved.json() as {draftId:string;versionId:string}
    await nav.getByRole('link',{name:'Biosamples',exact:true}).click(); await term.fill('Newer unfinished organism')
    await nav.getByRole('link',{name:'Study details'}).click(); await page.getByLabel('Description',{exact:true}).fill('Later description')
    await nav.getByRole('link',{name:'Local account'}).click()
    const second = page.waitForResponse(result => result.url().endsWith('/api/local/drafts') && result.request().method() === 'POST')
    await page.getByRole('button',{name:'Save local draft',exact:true}).click(); assert.equal((await second).status(),201)
    await page.locator('#history-draft').selectOption(draftId); await page.locator('#history-version option').nth(2).waitFor({state:'attached'})
    await page.locator('#history-version').selectOption(versionId)
    await page.getByText('Unfinished vocabulary: taxonomy: Historical unfinished organism').waitFor()
    const newer = await page.locator('#history-version option').nth(1).getAttribute('value'); assert.ok(newer)
    await page.locator('#history-compare').selectOption(newer)
    await page.getByText('Description: Earlier description → Later description').waitFor()
    const restored = page.waitForResponse(result => result.url().endsWith('/restore') && result.request().method() === 'POST')
    await page.getByRole('button',{name:'Restore selected version'}).click(); assert.equal((await restored).status(),201)
    await page.getByText('Revision restored as a new saved version.',{exact:false}).waitFor()
    await nav.getByRole('link',{name:'Biosamples',exact:true}).click(); assert.equal(await term.inputValue(),'Historical unfinished organism')
    await context.close()
  } finally {await browser.close(); if (server.exitCode === null) {server.kill(); await once(server,'exit')}}
})
