import {startOwnedServerProcess, stopOwnedServer} from '../support/owned-server.js'
import { request } from 'node:http'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chromium } from 'playwright'

const base = 'http://127.0.0.1:14322'
test('built local history inspects and restores revisions while conflicts retain edits', async t => {
  const {child:server} = await startOwnedServerProcess({port:14322, env:{...process.env, HOST:'127.0.0.1', BIJUX_LOCAL_REFERENCE:'1', BIJUX_LOCAL_WEB_PORT:'14322', BIJUX_LOCAL_IDENTITY_PORT:'18082', BIJUX_LOCAL_DATABASE_PORT:'15436'}})
  t.after(() => stopOwnedServer(server))
  const browser = await chromium.launch({headless:true})
  try {
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
    // A server restore may succeed while the browser's recovery copy disappears.
    // The local editor must retain its work and make the new remote revision visible.
    let releaseAdoption!:() => void, restoreSent!:() => void
    const adoptionHeld = new Promise<void>(resolve => {releaseAdoption = resolve}), restoreReached = new Promise<void>(resolve => {restoreSent = resolve})
    await page.route('**/restore', async route => {const result = await route.fetch(); restoreSent(); await adoptionHeld; await route.fulfill({response:result})})
    await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor()
    await page.getByRole('button',{name:'Restore selected version'}).click(); await restoreReached
    const otherTab = await context.newPage(); await otherTab.goto(base)
    await otherTab.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve,reject) => {const request=indexedDB.open('bijux-draft-recovery');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
      try {await new Promise<void>((resolve,reject) => {const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').clear();tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error)})} finally {db.close()}
    }); await otherTab.close()
    const historyRefresh = page.waitForResponse(result => result.url().endsWith('/api/local/drafts') && result.request().method() === 'GET')
    releaseAdoption(); await page.getByText('A new saved revision was created, but the current work remains open.',{exact:false}).waitFor(); await historyRefresh
    await page.unroute('**/restore')
    await page.locator('#history-draft').selectOption(draft); await page.locator('#history-version option').nth(2).waitFor({state:'attached'})
    await page.locator('#history-version').selectOption(older); await page.getByText('Study: First title').waitFor()
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
    await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor(); await page.getByRole('button',{name:'Restore selected version'}).click(); await page.getByText('The saved draft changed.',{exact:false}).waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click(); assert.equal(await page.getByLabel('Study title').inputValue(), 'Unsaved conflict work')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    const refreshed = page.waitForResponse(result => result.url().endsWith('/api/local/drafts') && result.request().method() === 'GET')
    await page.getByRole('button',{name:'Refresh saved drafts'}).click(); await refreshed
    await page.locator('#history-draft').selectOption(draft); await page.locator('#history-version option').nth(2).waitFor({state:'attached'})
    await page.locator('#history-version').selectOption(older); await page.getByText('Study: First title').waitFor()
    let drop = true
    await page.route('**/restore', async route => {if (drop) {drop = false; await route.fetch(); await route.abort('failed')} else await route.continue()})
    await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor(); await page.getByRole('button',{name:'Restore selected version'}).click(); await page.getByText('Restore could not be completed.',{exact:false}).waitFor()
    const count = async () => page.evaluate(async draft => ((await (await fetch(`/api/local/drafts/${draft}/versions`)).json()) as {versions:unknown[]}).versions.length, draft)
    const afterLost = await count()
    await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor(); await page.getByRole('button',{name:'Restore selected version'}).click(); await page.getByText('Revision restored as a new saved version.',{exact:false}).waitFor()
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
      await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor(); await page.getByRole('button',{name:'Restore selected version'}).click(); await selectionReached
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
    await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor(); await page.getByRole('button',{name:'Restore selected version'}).click(); await reached
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click(); await page.getByLabel('Study title').fill('Newer work during restore')
    release(); await page.getByText('A history restore created a new saved revision while you were away.',{exact:false}).waitFor()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Newer work during restore')
    await page.unroute('**/restore')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    const beforeOwnerRestore = page.waitForResponse(result => result.url().endsWith('/api/local/drafts') && result.request().method() === 'GET')
    await page.getByRole('button',{name:'Refresh saved drafts'}).click(); await beforeOwnerRestore
    await page.locator('#history-draft').selectOption(draft); await page.locator('#history-version option').nth(2).waitFor({state:'attached'})
    await page.locator('#history-version').selectOption(older); await page.getByText('Study: First title').waitFor()
    let releaseUnverified!:() => void, unverifiedSent!:() => void
    const unverifiedHeld = new Promise<void>(resolve => {releaseUnverified=resolve}), unverifiedReached = new Promise<void>(resolve => {unverifiedSent=resolve})
    await page.route('**/restore', async route => {const result=await route.fetch();unverifiedSent();await unverifiedHeld;await route.fulfill({response:result})})
    await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor();await page.getByRole('button',{name:'Restore selected version'}).click();await unverifiedReached
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    await page.route('**/api/local/session', route => route.fulfill({status:503,body:'Unavailable'}))
    releaseUnverified();await page.getByText('A history restore completed, but the account session could not be confirmed.',{exact:false}).waitFor();await page.getByText('check your connection and refresh the local account',{exact:false}).waitFor()
    assert.equal(await page.getByLabel('Study title').inputValue(),'Newer work during restore')
    await page.unroute('**/api/local/session');await page.unroute('**/restore')
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    const refreshAfterUnverified = page.waitForResponse(result => result.url().endsWith('/api/local/drafts') && result.request().method() === 'GET')
    await page.getByRole('button',{name:'Refresh saved drafts'}).click();await refreshAfterUnverified
    await page.locator('#history-draft').selectOption(draft);await page.locator('#history-version option').nth(2).waitFor({state:'attached'})
    await page.locator('#history-version').selectOption(older);await page.getByText('Study: First title').waitFor()
    const replacement = await browser.newContext(), replacementPage = await replacement.newPage()
    await replacementPage.goto(`${base}/api/local/auth/login`); await replacementPage.locator('#username').fill('researcher-b'); await replacementPage.locator('#password').fill('local-b'); await replacementPage.locator('#kc-login').click(); await replacementPage.waitForURL(`${base}/api/local/auth/callback*`)
    let releaseOwner!:() => void, ownerReached!:() => void
    const ownerHeld = new Promise<void>(resolve => {releaseOwner = resolve}), ownerSent = new Promise<void>(resolve => {ownerReached = resolve})
    await page.route('**/restore', async route => {const result = await route.fetch(); ownerReached(); await ownerHeld; await route.fulfill({response:result})})
    await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor(); await page.getByRole('button',{name:'Restore selected version'}).click(); await ownerSent
    assert.equal(await page.getByRole('button',{name:'Save local draft',exact:true}).isDisabled(), true)
    await context.addCookies(await replacement.cookies(base))
    const sessionCheck = page.waitForResponse(result => result.url().endsWith('/api/local/session') && result.status() === 200)
    releaseOwner(); await sessionCheck
    await page.getByText('Signed in to the local reference.',{exact:false}).waitFor()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Study details'}).click()
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Newer work during restore')
    await page.unroute('**/restore'); await replacement.close()
  } finally {await browser.close()}
})

test('history summarizes and restores unfinished vocabulary from the selected saved revision', async t => {
  const {child:server} = await startOwnedServerProcess({port:14322, env:{...process.env, HOST:'127.0.0.1', BIJUX_LOCAL_REFERENCE:'1', BIJUX_LOCAL_WEB_PORT:'14322', BIJUX_LOCAL_IDENTITY_PORT:'18082', BIJUX_LOCAL_DATABASE_PORT:'15436'}})
  t.after(() => stopOwnedServer(server))
  const browser = await chromium.launch({headless:true})
  try {
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
    await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor(); await page.getByRole('button',{name:'Restore selected version'}).click(); assert.equal((await restored).status(),201)
    await page.getByText('Revision restored as a new saved version.',{exact:false}).waitFor()
    await nav.getByRole('link',{name:'Biosamples',exact:true}).click(); assert.equal(await term.inputValue(),'Historical unfinished organism')
    const created = await page.evaluate(async draft => {
      const head = await (await fetch(`/api/local/drafts/${draft}`)).json() as {versionId:string;recovery:{pending:Array<{id:string;path:string;size:string}>}}
      head.recovery.pending = Array.from({length:105},(_,index) => ({id:`p:${index+1}`,path:`image-${String(index).padStart(3,'0')}.tif`,size:'1'}))
      let version = head.versionId
      for (let index=0; index<101; index++) {
        const response = await fetch('/api/local/drafts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:crypto.randomUUID(),draftId:draft,expectedHead:version,recovery:head.recovery})})
        if (!response.ok) throw Error(`Fixture save failed: ${response.status}`)
        version = ((await response.json()) as {versionId:string}).versionId
      }
      return version
    }, draftId)
    await nav.getByRole('link',{name:'Local account'}).click()
    const refresh = page.waitForResponse(result => result.url().endsWith('/api/local/drafts') && result.request().method() === 'GET')
    await page.getByRole('button',{name:'Refresh saved drafts'}).click(); await refresh
    await page.locator('#history-draft').selectOption(draftId); await page.locator('#history-version option').nth(100).waitFor({state:'attached'})
    assert.equal(await page.locator('#history-version option').count(),101)
    await page.locator('#history-version').selectOption(created); await page.getByText('image-000.tif',{exact:true}).waitFor()
    assert.equal(await page.getByText('image-050.tif',{exact:true}).count(),0)
    await page.getByRole('button',{name:'Next selected items'}).click(); await page.getByText('image-050.tif',{exact:true}).waitFor()
    await page.route(`**/versions/${created}`, async route => {
      const response = await route.fetch()
      const detail = await response.json() as {frozen:unknown}
      const files = Array.from({length:105},(_,index) => ({path:`frozen-${String(index).padStart(3,'0')}.json`,base64:Buffer.from(`bytes-${index}`).toString('base64')}))
      await route.fulfill({response,body:JSON.stringify({...detail,frozen:{status:'materialized',files}})})
    }, {times:1})
    await page.locator('#history-version').selectOption(''); await page.locator('#history-version').selectOption(created)
    await page.getByText('105 frozen files; page 1 of 3').waitFor()
    assert.equal(await page.getByRole('button',{name:'Download frozen-050.json'}).count(),0)
    await page.getByRole('button',{name:'Next frozen files'}).click()
    const frozenDownload = page.waitForEvent('download'); await page.getByRole('button',{name:'Download frozen-050.json'}).click()
    assert.equal((await readFile((await (await frozenDownload).path())!)).toString(),'bytes-50')
    await page.getByRole('button',{name:'Older versions'}).click(); await page.locator('#history-version option').filter({hasText:versionId}).waitFor({state:'attached'})
    await page.locator('#history-compare').selectOption(versionId); await page.getByText('Unfinished vocabulary: taxonomy: Historical unfinished organism').waitFor()
    assert.equal(await page.locator('#history-version').inputValue(), created)
    await page.getByRole('button',{name:'Newer versions'}).click(); await page.getByText('Version page 1',{exact:true}).waitFor()
    const delayedVersion = await page.locator('#history-version option').nth(2).getAttribute('value'); assert.ok(delayedVersion)
    let releaseSelected!:() => void, selectedEntered!:() => void
    const selectedHeld = new Promise<void>(resolve => {releaseSelected = resolve}), selectedReached = new Promise<void>(resolve => {selectedEntered = resolve})
    await page.route(`**/versions/${delayedVersion}/backup`, async route => {const response = await route.fetch(); selectedEntered(); await selectedHeld; await route.fulfill({response})},{times:1})
    await page.locator('#history-version').selectOption(delayedVersion); await selectedReached
    await page.getByRole('button',{name:'Older versions'}).click(); await page.getByText('Version page 2',{exact:true}).waitFor()
    releaseSelected()
    await page.getByRole('button',{name:'Download historical backup'}).waitFor({timeout:5000})
    assert.equal(await page.locator('#history-version').inputValue(), delayedVersion)
    const expectedSelected = await page.evaluate(async ({draftId,delayedVersion}) => await (await fetch(`/api/local/drafts/${draftId}/versions/${delayedVersion}/backup`)).text(), {draftId,delayedVersion})
    const selectedDownload = page.waitForEvent('download'); await page.getByRole('button',{name:'Download historical backup'}).click()
    assert.equal((await readFile((await (await selectedDownload).path())!)).toString(),expectedSelected)
    let releaseComparison!:() => void, comparisonEntered!:() => void
    const comparisonHeld = new Promise<void>(resolve => {releaseComparison = resolve}), comparisonReached = new Promise<void>(resolve => {comparisonEntered = resolve})
    await page.route(`**/versions/${versionId}/backup`, async route => {const response = await route.fetch(); comparisonEntered(); await comparisonHeld; await route.fulfill({response})},{times:1})
    await page.locator('#history-compare').selectOption(''); await page.locator('#history-compare').selectOption(versionId); await comparisonReached
    await page.getByRole('button',{name:'Newer versions'}).click(); await page.getByText('Version page 1',{exact:true}).waitFor()
    releaseComparison()
    await page.getByRole('button',{name:'Download comparison backup'}).waitFor({timeout:5000})
    assert.equal(await page.locator('#history-compare').inputValue(), versionId)
    const expectedComparison = await page.evaluate(async ({draftId,versionId}) => await (await fetch(`/api/local/drafts/${draftId}/versions/${versionId}/backup`)).text(), {draftId,versionId})
    const comparisonDownload = page.waitForEvent('download'); await page.getByRole('button',{name:'Download comparison backup'}).click()
    assert.equal((await readFile((await (await comparisonDownload).path())!)).toString(),expectedComparison)
    const replacement = await browser.newContext(), replacementPage = await replacement.newPage()
    await replacementPage.goto(`${base}/api/local/auth/login`); await replacementPage.locator('#username').fill('researcher-b'); await replacementPage.locator('#password').fill('local-b'); await replacementPage.locator('#kc-login').click(); await replacementPage.waitForURL(`${base}/api/local/auth/callback*`)
    const replacementCookie = (await replacement.cookies(base)).find(cookie => cookie.name === 'draft_session'); assert.ok(replacementCookie)
    await context.addCookies([replacementCookie])
    const denied = page.waitForResponse(result => result.url().includes('/versions?before=') && result.status() === 403)
    await page.getByRole('button',{name:'Older versions'}).click(); await denied
    await page.getByRole('button',{name:'Download historical backup'}).waitFor({state:'hidden',timeout:5000})
    assert.equal(await page.getByRole('button',{name:'Download comparison backup'}).count(),0)
    await replacement.close()
    await context.close()
  } finally {await browser.close()}
})


test('history fixture refuses an occupied port without contacting the other listener', async t => {
  const {createServer} = await import('node:http')
  const env = {...process.env, HOST:'127.0.0.1', BSS_MODE:'standalone', BIJUX_LOCAL_REFERENCE:'1', BIJUX_LOCAL_WEB_PORT:'14322', BIJUX_LOCAL_IDENTITY_PORT:'18082', BIJUX_LOCAL_DATABASE_PORT:'15436'}
  const probe = await startOwnedServerProcess({port:0,env})
  t.after(() => stopOwnedServer(probe.child))
  assert.equal((await fetch(`http://127.0.0.1:${probe.port}/`)).status,200)
  await stopOwnedServer(probe.child)
  let hits = 0
  const foreign = createServer((_request,response) => {hits++; response.end('unrelated')})
  await new Promise<void>((resolve,reject) => {foreign.once('error',reject); foreign.listen(0,'127.0.0.1',resolve)})
  t.after(() => new Promise<void>((resolve,reject) => foreign.close(error => error ? reject(error) : resolve())))
  const address = foreign.address(); assert.ok(address && typeof address !== 'string')
  await assert.rejects(startOwnedServerProcess({port:address.port,env}), /server.*(start|readiness)/i)
  assert.equal(hits,0)
  assert.equal(foreign.listening,true)
})
