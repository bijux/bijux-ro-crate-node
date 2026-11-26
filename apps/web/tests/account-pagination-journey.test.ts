import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import test from 'node:test'
import {chromium} from 'playwright'

test('local draft pages keep their account boundary when the session changes', async () => {
  const base = 'http://127.0.0.1:49373'
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {cwd:new URL('..', import.meta.url), env:{...process.env, HOST:'127.0.0.1', PORT:'49373', BSS_MODE:'standalone'}, stdio:'ignore'})
  let browser
  try {
    for (let attempt = 0; ; attempt++) {
      try {if ((await fetch(base)).ok) break} catch {}
      if (attempt === 100 || server.exitCode !== null) throw Error('Built app did not start')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    browser = await chromium.launch({headless:true})
    const page = await browser.newPage(), first = '00000000-0000-0000-0000-000000000001', second = '00000000-0000-0000-0000-000000000002'
    let subject = 'alice', hold = false, release:() => void = () => {}, entered:() => void = () => {}
    const blocked = new Promise<void>(resolve => {entered = resolve})
    await page.route('**/api/local/session', route => route.fulfill({status:200, json:{issuer:'fixture', subject}}))
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
  } finally {await browser?.close(); if (server.exitCode === null) {server.kill(); await new Promise<void>(resolve => server.once('exit', () => resolve()))}}
})
