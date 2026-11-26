import {spawn, execFileSync, type ChildProcess} from 'node:child_process'
import {once} from 'node:events'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {chromium} from 'playwright'
import pg from 'pg'
import {applyChange, createDraft, importCrate} from '@bijux/ro-crate-creator'
import {encodeRecovery} from '../src/drafts/recovery-codec.js'
import {startReferenceReceiver} from './server/support/reference-receiver.js'

if (process.env.BIJUX_REFERENCE_DISPOSABLE !== 'bijux-reference-postgres' || process.env.REFERENCE_DATABASE_URL !== 'postgresql://postgres:reference@127.0.0.1:15441/reference') throw Error('Dedicated receiver fixture required')
const base='http://127.0.0.1:14325'
const fixture=new URL('../../../tests/parity/fixtures/test_minimal_valid_ro_crate/',import.meta.url)
const receiverConfig={host:'127.0.0.1',port:15441,user:'postgres',password:'reference',database:'reference',ssl:false}
let receiverPool=new pg.Pool(receiverConfig)
function verifyReceiverContainer() {
  if (process.env.BIJUX_REFERENCE_CONTAINER !== 'bijuxreferencesubmission-receiver-db') throw Error('Explicit disposable receiver container required')
  const data=JSON.parse(execFileSync('docker',['inspect','bijuxreferencesubmission-receiver-db'],{encoding:'utf8'})) as Array<{Name:string;Config:{Image:string;Labels:Record<string,string>};NetworkSettings:{Ports:Record<string,Array<{HostIp:string;HostPort:string}>>}}>
  const container=data[0], ports=container.NetworkSettings.Ports['5432/tcp']
  if (container.Name !== '/bijuxreferencesubmission-receiver-db' || container.Config.Image !== 'postgres:17.12@sha256:87c8b42f423b45d5247e6aa8fdb2e7762fec164c68a50fe3eb07e7bfcaf4dbcf' || container.Config.Labels['bijux.fixture'] !== 'reference-receiver-postgres' || ports.length !== 1 || ports[0].HostIp !== '127.0.0.1' || ports[0].HostPort !== '15441') throw Error('Receiver container identity or loopback binding mismatch')
}
async function restartReceiverDatabase() {
  verifyReceiverContainer()
  execFileSync('docker',['restart','bijuxreferencesubmission-receiver-db'],{stdio:'ignore'})
  receiverPool=new pg.Pool(receiverConfig)
  for (let attempt=0; ; attempt++) {try {await receiverPool.query('SELECT 1'); return} catch {if (attempt===100) throw Error('Receiver database did not restart'); await new Promise(resolve=>setTimeout(resolve,100))}}
}
const entry=fileURLToPath(new URL('../../../artifacts/web/dist/server/entry.mjs',import.meta.url))
function startApp():ChildProcess {return spawn(process.execPath,[entry],{cwd:'/',env:{...process.env,HOST:'127.0.0.1',PORT:'14325',BIJUX_LOCAL_REFERENCE:'1',BIJUX_LOCAL_WEB_PORT:'14325',BIJUX_LOCAL_IDENTITY_PORT:'18085',BIJUX_LOCAL_DATABASE_PORT:'15440',BIJUX_LOCAL_RECEIVER_PORT:'14525'},stdio:'ignore'})}
async function stopApp(app:ChildProcess) {if (app.exitCode === null) {app.kill(); await once(app,'exit')}}
async function ready(app:ChildProcess) {for (let attempt=0; ; attempt++) {try {if ((await fetch(base)).ok) return} catch {} if (attempt===100 || app.exitCode !== null) throw Error('Astro did not start'); await new Promise(resolve=>setTimeout(resolve,100))}}

test('authenticated saved bytes reach the durable local receiver after response loss and restart', async () => {
  verifyReceiverContainer()
  let receiver=await startReferenceReceiver(receiverPool,14525,{loseFirstResponse:true}), app=startApp()
  const browser=await chromium.launch({headless:true})
  try {
    await receiverPool.query('TRUNCATE reference_receiver.receipts'); await ready(app)
    const files=new Map(await Promise.all(['ro-crate-metadata.json','file_list.tsv'].map(async name=>[name,new Uint8Array(await readFile(new URL(name,fixture)))] as const)))
    const imported=await importCrate(files,{metadataPaths:[...files.keys()]}); assert.equal(imported.status,'read-only'); if (imported.status !== 'read-only') throw Error('Expected read-only import')
    const recovery=JSON.parse(encodeRecovery({readOnly:imported,pending:[]})) as unknown
    const context=await browser.newContext(), page=await context.newPage()
    await page.goto(`${base}/api/local/auth/login`); await page.locator('#username').fill('researcher-a'); await page.locator('#password').fill('local-a'); await page.locator('#kc-login').click(); await page.waitForURL(`${base}/api/local/auth/callback*`)
    const owner=await page.evaluate(async () => {const result=await fetch('/api/local/session'); const value=await result.json() as {issuer:string;subject:string}; return JSON.stringify([value.issuer,value.subject])})
    const pendingRecovery=JSON.parse(encodeRecovery({readOnly:imported,pending:[{id:'p:1',path:'pending.tif',size:'1'}]})) as unknown
    const blocked=await page.evaluate(async ({pendingRecovery,owner}) => {
      const saved=await (await fetch('/api/local/drafts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:crypto.randomUUID(),recovery:pendingRecovery})})).json() as {draftId:string;versionId:string}
      return (await fetch(`/api/local/drafts/${saved.draftId}/versions/${saved.versionId}/submission`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:crypto.randomUUID(),owner})})).status
    },{pendingRecovery,owner})
    assert.equal(blocked,422); assert.equal((await receiverPool.query('select count(*)::int as count from reference_receiver.receipts')).rows[0].count,0)
    const study=applyChange(createDraft(),{type:'add-study'}); if (study.status !== 'applied') throw Error('study setup')
    const sample=applyChange(study.draft,{type:'add-entity',kind:'biosample'}); if (sample.status !== 'applied') throw Error('sample setup')
    const pendingTerm=JSON.parse(encodeRecovery({draft:sample.draft,pending:[],pendingTerms:[{kind:'taxonomy',entityId:sample.entityId,previousId:null,identifier:'NCBITaxon:',label:'unfinished'}]})) as unknown
    const blockedTerm=await page.evaluate(async ({pendingTerm,owner}) => {
      const saved=await (await fetch('/api/local/drafts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:crypto.randomUUID(),recovery:pendingTerm})})).json() as {draftId:string;versionId:string}
      return (await fetch(`/api/local/drafts/${saved.draftId}/versions/${saved.versionId}/submission`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:crypto.randomUUID(),owner})})).status
    },{pendingTerm,owner})
    assert.equal(blockedTerm,422); assert.equal((await receiverPool.query('select count(*)::int as count from reference_receiver.receipts')).rows[0].count,0)
    const saved=await page.evaluate(async recovery => {const response=await fetch('/api/local/drafts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:crypto.randomUUID(),recovery})}); if (!response.ok) throw Error(`Save ${response.status}`); return await response.json() as {draftId:string;versionId:string}},recovery)
    const endpoint=`/api/local/drafts/${saved.draftId}/versions/${saved.versionId}/submission`
    await page.goto(base); await page.getByRole('button',{name:'Create study'}).click(); await page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name:'Local account'}).click()
    await page.locator('#history-draft option').filter({hasText:saved.draftId}).waitFor({state:'attached'}); await page.locator('#history-draft').selectOption(saved.draftId)
    await page.locator('#history-version option').nth(1).waitFor({state:'attached'}); await page.locator('#history-version').selectOption(saved.versionId)
    await page.getByRole('button',{name:'Submit selected version to local reference'}).click()
    await page.getByText(/Local reference outcome: uncertain/).waitFor()
    const operation=await page.evaluate(async draftId => (await (await fetch(`/api/local/drafts/${draftId}/submission`)).json()).operation as {operationId:string;state:string},saved.draftId)
    assert.equal(operation.state,'uncertain')
    await stopApp(app); await receiver.close(); await receiverPool.end(); await restartReceiverDatabase(); receiver=await startReferenceReceiver(receiverPool,14525); app=startApp(); await ready(app)
    const retries=await page.evaluate(async ({endpoint,owner}) => Promise.all([0,1].map(async () => {const result=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:crypto.randomUUID(),owner})}); return {status:result.status,body:await result.json()}})), {endpoint,owner})
    for (const retry of retries) {assert.equal(retry.status,200); assert.equal(retry.body.operation.state,'accepted'); assert.equal(retry.body.operation.operationId,operation.operationId); assert.match(retry.body.operation.receiptId,/^local-reference-/)}
    await receiver.close()
    await page.getByRole('button',{name:'Submit selected version to local reference'}).click()
    await page.getByText(/Receiver unavailable; last known local receipt:/).waitFor({timeout:5000})
    await page.getByText(/Last receiver observation:/).waitFor({timeout:5000})
    await page.route(`**${endpoint}`, async route => {if (route.request().method() === 'POST') await route.fulfill({status:422,contentType:'application/json',body:'{}'}); else await route.continue()})
    await page.getByRole('button',{name:'Submit selected version to local reference'}).click()
    await page.getByText(new RegExp(`Known local receipt: ${retries[0].body.operation.receiptId}`)).waitFor()
    await page.getByText(/Receiver unavailable; last receiver observation:/).waitFor({timeout:5000})
    await page.unroute(`**${endpoint}`)
    receiver=await startReferenceReceiver(receiverPool,14525)
    const changed=await page.evaluate(async ({saved,recovery,owner}) => {
      const result=await fetch('/api/local/drafts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:crypto.randomUUID(),draftId:saved.draftId,expectedHead:saved.versionId,recovery})})
      const next=await result.json() as {versionId:string}
      return (await fetch(`/api/local/drafts/${saved.draftId}/versions/${next.versionId}/submission`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:crypto.randomUUID(),owner})})).status
    },{saved,recovery,owner})
    assert.equal(changed,409)
    const frozen=await page.evaluate(async ({draftId,versionId}) => await (await fetch(`/api/local/drafts/${draftId}/versions/${versionId}/files`)).json() as {files:Array<{path:string;base64:string}>},saved)
    const payload=JSON.stringify({operationKey:operation.operationId,files:frozen.files.sort((a,b)=>a.path < b.path ? -1 : a.path > b.path ? 1 : 0)})
    const receipts=await receiverPool.query<{payload_hash:string}>('SELECT payload_hash FROM reference_receiver.receipts')
    assert.equal(receipts.rowCount,1); assert.equal(receipts.rows[0].payload_hash,createHash('sha256').update(payload).digest('hex'))
    const other=await browser.newContext(), otherPage=await other.newPage()
    await otherPage.goto(`${base}/api/local/auth/login`); await otherPage.locator('#username').fill('researcher-b'); await otherPage.locator('#password').fill('local-b'); await otherPage.locator('#kc-login').click(); await otherPage.waitForURL(`${base}/api/local/auth/callback*`)
    const denied=await otherPage.evaluate(async ({endpoint,draftId}) => {const session=await (await fetch('/api/local/session')).json() as {issuer:string;subject:string}; const post=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:'other',owner:JSON.stringify([session.issuer,session.subject])})}); return [post.status,(await fetch(`/api/local/drafts/${draftId}/submission`)).status]}, {endpoint,draftId:saved.draftId})
    assert.deepEqual(denied,[404,404])
    await page.getByRole('button',{name:'Submit selected version to local reference'}).click()
    await page.getByText(/Local reference receiver accepted this create:/).waitFor()
    await page.route(`**${endpoint}`,route => route.fulfill({status:409}),{times:1})
    await page.getByRole('button',{name:'Submit selected version to local reference'}).click()
    await page.getByText(`Known local receipt: ${retries[0].body.operation.receiptId}. A different version is already bound to this local submission.`,{exact:true}).waitFor()
    await page.route(`**${endpoint}`,route => route.fulfill({status:503}),{times:1})
    await page.getByRole('button',{name:'Submit selected version to local reference'}).click()
    await page.getByText(`Known local receipt: ${retries[0].body.operation.receiptId}. Local submission is unavailable. Check the selected version and try again.`,{exact:true}).waitFor()
    const ownCookie=(await context.cookies(base)).find(item=>item.name==='draft_session'), otherCookie=(await other.cookies(base)).find(item=>item.name==='draft_session')
    assert.ok(ownCookie); assert.ok(otherCookie)
    await context.addCookies([otherCookie])
    const mismatch=page.waitForResponse(response=>response.url().endsWith('/submission') && response.request().method()==='POST' && response.status()===403)
    await page.getByRole('button',{name:'Submit selected version to local reference'}).click(); await mismatch
    await page.getByRole('button',{name:'Submit selected version to local reference'}).waitFor({state:'hidden'})
    assert.equal(await page.getByText(`Known local receipt: ${retries[0].body.operation.receiptId}.`,{exact:false}).count(),0)
    await context.addCookies([ownCookie]); await page.getByRole('button',{name:'Refresh saved drafts'}).click()
    await page.locator('#history-draft option').filter({hasText:saved.draftId}).waitFor({state:'attached'}); await page.locator('#history-draft').selectOption(saved.draftId)
    await page.locator('#history-version option').filter({hasText:saved.versionId}).waitFor({state:'attached'}); await page.locator('#history-version').selectOption(saved.versionId)
    await page.getByRole('button',{name:'Submit selected version to local reference'}).waitFor()
    await page.route(`**${endpoint}`,route => route.abort('failed'),{times:1}); await context.addCookies([otherCookie])
    await page.getByRole('button',{name:'Submit selected version to local reference'}).click()
    await page.getByRole('button',{name:'Submit selected version to local reference'}).waitFor({state:'hidden'})
    assert.equal(await page.getByText(`Known local receipt: ${retries[0].body.operation.receiptId}.`,{exact:false}).count(),0)
    await other.close(); await context.close()
  } finally {await browser.close(); await stopApp(app); try {await receiver.close()} catch {} await receiverPool.end()}
})
