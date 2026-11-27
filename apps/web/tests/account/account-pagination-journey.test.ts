import {startOwnedServer} from '../support/owned-server.js'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {once} from 'node:events'
import test from 'node:test'
import {chromium} from 'playwright'

test('local draft pages keep their account boundary when the session changes', async t => {
  const base = await startOwnedServer(t)
  let browser
  try {
    browser = await chromium.launch({headless:true})
    const page = await browser.newPage(), first = '00000000-0000-0000-0000-000000000001', second = '00000000-0000-0000-0000-000000000002'
    let subject = 'alice', hold = false, release:() => void = () => {}, entered:() => void = () => {}
    const blocked = new Promise<void>(resolve => {entered = resolve})
    await page.route('**/api/local/session', route => route.fulfill({status:200, json:{issuer:'fixture', session:'a'.repeat(64), subject}}))
    await page.route('**/api/local/drafts*', async route => {
      const older = new URL(route.request().url()).searchParams.has('before')
      if (older && hold) {entered(); await new Promise<void>(resolve => {release = resolve})}
      const id = older ? second : first
      await route.fulfill({status:200, json:{drafts:[{draftId:id, versionId:id, savedAt:'2025-01-01T00:00:00Z'}], nextCursor:older ? null : first}})
    })
    await page.goto(base)
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link', {name:'Local account'}).click()
    await page.locator(`#account-draft option[value="${first}"]`).waitFor({state:'attached'})
    await page.getByRole('button', {name:'Older saved drafts'}).click()
    await page.locator(`#account-draft option[value="${second}"]`).waitFor({state:'attached'})
    await page.getByRole('button', {name:'Newer saved drafts'}).click()
    await page.locator(`#account-draft option[value="${first}"]`).waitFor({state:'attached'})
    hold = true
    await page.getByRole('button', {name:'Older saved drafts'}).click()
    await blocked; subject = 'bob'; release()
    await page.getByText('The local account changed. Your current work remains open; sign in again.').waitFor()
    assert.equal(await page.locator('#account-draft').count(), 0)
  } finally {await browser?.close()}
})

test('failed local sign-out lets the user check and retry the current session', async t => {
  const base = await startOwnedServer(t)
  let browser
  try {
    browser = await chromium.launch({headless:true})
    const page = await browser.newPage(); page.setDefaultTimeout(5000)
    let failure = 409
    await page.route('**/api/local/session', route => route.fulfill({status:200,json:{issuer:'fixture',subject:'alice',session:'a'.repeat(64)}}))
    await page.route('**/api/local/drafts', route => route.fulfill({status:200,json:{drafts:[],nextCursor:null}}))
    await page.route('**/api/local/auth/logout', route => route.fulfill({status:failure}))
    await page.goto(base)
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    for (const status of [409,503]) {
      failure = status
      await page.getByRole('button',{name:'Sign out locally'}).click()
      await page.getByText(status === 409 ? 'The local session changed before sign-out.' : 'The local account request could not be completed.', {exact:false}).waitFor()
      await page.getByRole('button',{name:'Check local session'}).click()
      await page.getByRole('button',{name:'Sign out locally'}).waitFor()
    }
    failure = 204
    await page.getByRole('button',{name:'Sign out locally'}).click()
    await page.getByText('Signed out locally.',{exact:false}).waitFor()
  } finally {await browser?.close()}
})

test('local account shows only the confirmed session label as text', async t => {
  const base = await startOwnedServer(t)
  let browser
  try {
    browser = await chromium.launch({headless:true})
    const page = await browser.newPage(); page.setDefaultTimeout(5000)
    let identity = {issuer:'fixture',subject:'alice',session:'a'.repeat(64),preferredUsername:'<img src=x onerror=alert(1)>'}
    await page.route('**/api/local/session', route => route.fulfill({status:200,json:identity}))
    await page.route('**/api/local/drafts', route => route.fulfill({status:200,json:{drafts:[],nextCursor:null}}))
    await page.goto(base)
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.getByText('Last checked local account: <img src=x onerror=alert(1)>', {exact:true}).waitFor()
    assert.equal(await page.locator('#account-title + img').count(),0)
    identity = {...identity, preferredUsername:''}
    await page.getByRole('button',{name:'Refresh saved drafts'}).click()
    await page.getByText('Last checked local account: account name unavailable', {exact:true}).waitFor()
    identity = {...identity,preferredUsername:'bob',session:'b'.repeat(64)}
    await page.getByRole('button',{name:'Refresh saved drafts'}).click()
    await page.getByText('Last checked local account: bob', {exact:true}).waitFor()
  } finally {await browser?.close()}
})

test('a session change during account refresh never confirms a stale label', async t => {
  const base = await startOwnedServer(t)
  let browser
  try {
    browser = await chromium.launch({headless:true})
    for (const subject of ['alice','bob']) {
      const context = await browser.newContext(), page = await context.newPage()
      let identity = {issuer:'fixture',subject:'alice',session:'a'.repeat(64),preferredUsername:'Alice'}
      let release!:() => void, started!:() => void
      const waiting = new Promise<void>(resolve => {release = resolve}), reached = new Promise<void>(resolve => {started = resolve})
      await page.route('**/api/local/session', route => route.fulfill({status:200,json:identity}))
      await page.route('**/api/local/drafts', async route => {started(); await waiting; await route.fulfill({status:200,json:{drafts:[],nextCursor:null}})})
      await page.goto(base); await reached
      identity = {...identity,subject,session:'b'.repeat(64),preferredUsername:'New account'}
      release()
      await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
      await page.getByText('The local account changed.',{exact:false}).waitFor()
      assert.equal(await page.getByText('Last checked local account: Alice',{exact:true}).count(),0)
      await context.close()
    }
  } finally {await browser?.close()}
})

test('readiness uses the spawned server while another listener is present', async t => {
  let hits = 0
  const stranger = createServer((_request, response) => {hits++; response.end('unrelated')})
  stranger.listen(0, '127.0.0.1')
  await once(stranger, 'listening')
  t.after(() => new Promise<void>((resolve, reject) => stranger.close(error => error ? reject(error) : resolve())))
  const address = stranger.address()
  assert.ok(address && typeof address !== 'string')
  const base = await startOwnedServer(t)
  assert.notEqual(Number(new URL(base).port), address.port)
  assert.equal((await fetch(base)).ok, true)
  assert.equal(hits, 0)
})
