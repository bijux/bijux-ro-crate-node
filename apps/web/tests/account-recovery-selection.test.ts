import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {test} from 'node:test'
import {chromium} from 'playwright'
import {applyChange, createDraft} from '@bijux/ro-crate-creator'
import {encodeRecovery} from '../src/drafts/recovery-codec.js'

const base = 'http://127.0.0.1:49375'
const id = '00000000-0000-0000-0000-000000000001'
test('a later read-only recovery selection survives an earlier account draft response', async () => {
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
    await page.route('**/api/local/session', route => route.fulfill({status:200,json:{issuer:'fixture',subject:'alice'}}))
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
    await nav('Local account')
    await page.locator('#account-draft').selectOption(id)
    await page.getByRole('button', {name:'Open saved local draft'}).click()
    await page.getByText('Local draft opened.', {exact:false}).waitFor()
    assert.equal(confirmations, 1)
    await nav('Study details')
    assert.equal(await page.getByLabel('Study title').inputValue(), 'Older account draft')
  } finally {
    await browser?.close()
    if (server.exitCode === null) {const stopped = once(server,'exit'); server.kill(); await stopped}
  }
})
