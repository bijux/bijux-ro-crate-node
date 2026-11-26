import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {chromium} from 'playwright'
import {applyChange, createDraft, importCrate} from '@bijux/ro-crate-creator'
import {encodeRecovery} from '../src/drafts/recovery-codec.js'

const webPort = process.env.BIJUX_QUAL_WEB_PORT ?? '14324'
const identityPort = process.env.BIJUX_QUAL_IDENTITY_PORT ?? '18084'
const databasePort = process.env.BIJUX_QUAL_DATABASE_PORT ?? '15439'
const base = `http://127.0.0.1:${webPort}`
const fixture = new URL('../../../tests/parity/fixtures/test_minimal_valid_ro_crate/', import.meta.url)

test('saved frozen versions are qualified by the built authenticated server', async () => {
  const entry = fileURLToPath(new URL('../../../artifacts/web/dist/server/entry.mjs', import.meta.url))
  const server = spawn(process.execPath, [entry], {cwd:'/', env:{...process.env, HOST:'127.0.0.1', PORT:webPort, BIJUX_LOCAL_REFERENCE:'1', BIJUX_LOCAL_WEB_PORT:webPort, BIJUX_LOCAL_IDENTITY_PORT:identityPort, BIJUX_LOCAL_DATABASE_PORT:databasePort}, stdio:'ignore'})
  const browser = await chromium.launch({headless:true})
  try {
    for (let attempt = 0; ; attempt++) {try {if ((await fetch(base)).ok) break} catch {} if (attempt === 100 || server.exitCode !== null) throw Error('Astro did not start'); await new Promise(resolve => setTimeout(resolve,100))}
    const files = new Map(await Promise.all(['ro-crate-metadata.json','file_list.tsv'].map(async name => [name, new Uint8Array(await readFile(new URL(name,fixture)))] as const)))
    const imported = await importCrate(files, {metadataPaths:[...files.keys()]})
    assert.equal(imported.status, 'read-only')
    if (imported.status !== 'read-only') throw Error('expected read-only import')
    const recovery = JSON.parse(encodeRecovery({readOnly:imported, pending:[]})) as unknown
    const changed = new Map(files)
    const metadata = JSON.parse(new TextDecoder().decode(changed.get('ro-crate-metadata.json'))) as {'@graph':Array<Record<string,unknown>>}
    delete metadata['@graph'][1].name
    changed.set('ro-crate-metadata.json', new TextEncoder().encode(JSON.stringify(metadata)))
    const changedImport = await importCrate(changed, {metadataPaths:[...changed.keys()]})
    assert.equal(changedImport.status, 'read-only')
    if (changedImport.status !== 'read-only') throw Error('expected read-only import')
    const changedRecovery = JSON.parse(encodeRecovery({readOnly:changedImport, pending:[]})) as unknown
    const pendingRecovery = JSON.parse(encodeRecovery({readOnly:imported, pending:[{id:'p:1', path:'pending.tif', size:'1'}]})) as unknown
    const context = await browser.newContext(), page = await context.newPage()
    await page.goto(`${base}/api/local/auth/login`)
    await page.locator('#username').fill('researcher-a'); await page.locator('#password').fill('local-a'); await page.locator('#kc-login').click()
    await page.waitForURL(`${base}/api/local/auth/callback*`)
    const first = await page.evaluate(async recovery => {
      const response = await fetch('/api/local/drafts', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:crypto.randomUUID(),recovery})})
      return {status:response.status, value:await response.json() as {draftId:string;versionId:string;contentHash:string}}
    }, recovery)
    assert.equal(first.status, 201)
    const {draftId, versionId} = first.value
    const endpoint = `/api/local/drafts/${draftId}/versions/${versionId}/qualification`
    const qualify = async (path:string) => page.evaluate(async path => {const response = await fetch(path, {method:'POST'}); return {status:response.status,body:await response.json()}}, path)
    const valid = await qualify(endpoint)
    assert.equal(valid.status, 200); assert.equal(valid.body.status, 'valid'); assert.equal(valid.body.version.versionId, versionId)
    assert.equal(valid.body.version.contentHash, first.value.contentHash); assert.match(valid.body.digest, /^[a-f0-9]{64}$/)
    const pending = await page.evaluate(async ({draftId,versionId,recovery}) => {
      const response = await fetch('/api/local/drafts', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:crypto.randomUUID(), draftId,expectedHead:versionId,recovery})})
      return await response.json() as {versionId:string}
    }, {draftId,versionId,recovery:pendingRecovery})
    const blocked = await qualify(`/api/local/drafts/${draftId}/versions/${pending.versionId}/qualification`)
    assert.equal(blocked.body.status,'incomplete')
    const changedVersion = await page.evaluate(async ({draftId, head, recovery}) => {
      const response = await fetch('/api/local/drafts', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:crypto.randomUUID(), draftId,expectedHead:head,recovery})})
      return await response.json() as {versionId:string}
    }, {draftId,head:pending.versionId,recovery:changedRecovery})
    const invalid = await qualify(`/api/local/drafts/${draftId}/versions/${changedVersion.versionId}/qualification`)
    assert.equal(invalid.body.status, 'invalid')
    assert.notEqual(invalid.body.digest,valid.body.digest)
    assert.notEqual(invalid.body.version.versionId,valid.body.version.versionId)
    const fresh = applyChange(createDraft(), {type:'add-study'})
    assert.equal(fresh.status, 'applied')
    if (fresh.status !== 'applied') throw Error('study setup failed')
    const freshRecovery = JSON.parse(encodeRecovery({draft:fresh.draft, pending:[]})) as unknown
    const freshSaved = await page.evaluate(async recovery => {
      const response = await fetch('/api/local/drafts', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:crypto.randomUUID(),recovery})})
      return await response.json() as {draftId:string;versionId:string}
    }, freshRecovery)
    const freshResult = await qualify(`/api/local/drafts/${freshSaved.draftId}/versions/${freshSaved.versionId}/qualification`)
    assert.equal(freshResult.body.status, 'invalid')
    const other = await browser.newContext(), otherPage = await other.newPage()
    await otherPage.goto(`${base}/api/local/auth/login`); await otherPage.locator('#username').fill('researcher-b'); await otherPage.locator('#password').fill('local-b'); await otherPage.locator('#kc-login').click(); await otherPage.waitForURL(`${base}/api/local/auth/callback*`)
    assert.equal((await otherPage.evaluate(async endpoint => (await fetch(endpoint,{method:'POST'})).status, endpoint)),404)
    await other.close()
    await page.goto(base)
    await page.getByRole('button',{name:'Create study'}).click()
    await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.locator('#history-draft option').filter({hasText:draftId}).waitFor({state:'attached'})
    await page.locator('#history-draft').selectOption(draftId)
    await page.locator('#history-version option').nth(2).waitFor({state:'attached'})
    await page.locator('#history-version').selectOption(versionId)
    await page.getByRole('button',{name:'Validate saved version'}).click()
    await page.getByText('Local reference default validation: valid.',{exact:true}).waitFor()
    let release!:() => void, entered!:() => void
    const held = new Promise<void>(resolve => {release = resolve}), reached = new Promise<void>(resolve => {entered = resolve})
    await page.route('**/qualification', async route => {const response = await route.fetch(); entered(); await held; try {await route.fulfill({response})} catch { /* Selection cancellation may close the request. */ }})
    await page.getByRole('button',{name:'Validate saved version'}).click(); await reached
    await page.locator('#history-version').selectOption(pending.versionId)
    release(); await page.unroute('**/qualification')
    assert.equal(await page.getByText('Local reference default validation: valid.',{exact:true}).count(),0)
    await page.getByRole('button',{name:'Validate saved version'}).click()
    await page.getByText(/Local reference default validation: incomplete/).waitFor()
    await context.close()
  } finally {await browser.close(); if (server.exitCode === null) {server.kill(); await once(server,'exit')}}
})
