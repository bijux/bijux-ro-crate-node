import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {createServer} from 'node:net'
import {test} from 'node:test'
import {chromium} from 'playwright'
import {applyChange, createDraft, materializeDraft} from '@bijux/ro-crate-creator'

for (const scenario of ['newer oversized edit','changed then restored','changed session','failed acknowledgement','failed refresh','unauthorized refresh','forbidden refresh','conflict refresh'] as const) test(`a confirmed save preserves ${scenario}`, async () => {
  const socket=createServer();await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));const address=socket.address();if(!address||typeof address==='string')throw Error('port');const port=address.port;await new Promise<void>(resolve=>socket.close(()=>resolve()))
  const base=`http://127.0.0.1:${port}`,server=spawn(process.execPath,['../../artifacts/web/dist/server/entry.mjs'],{cwd:new URL('../..',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),BSS_MODE:'standalone',BIJUX_LOCAL_REFERENCE:'1',NODE_ENV:'development'},stdio:'ignore'})
  let browser
  try {
    for(let attempt=0;;attempt++){try{if((await fetch(base)).ok)break}catch{}if(attempt===100||server.exitCode!==null)throw Error('App did not start');await new Promise(resolve=>setTimeout(resolve,100))}
    const initial=applyChange(createDraft(),{type:'add-study'});if(initial.status!=='applied')throw Error('fixture');const output=materializeDraft(initial.draft);if(output.status!=='materialized')throw Error('fixture')
    browser=await chromium.launch({headless:true});const page=await browser.newPage();page.setDefaultTimeout(30000)
    const draftId='00000000-0000-0000-0000-000000000001',secondVersion='00000000-0000-0000-0000-000000000002'
    let release!:()=>void, reached!:()=>void, session='a'.repeat(64), count=0
    const held=new Promise<void>(resolve=>{release=resolve}), sent=new Promise<void>(resolve=>{reached=resolve}), requests:Array<Record<string,unknown>>=[]
    await page.route('**/api/local/session',route=>route.fulfill({status:200,json:{issuer:'fixture',subject:'alice',session}}))
    await page.route('**/api/local/drafts',async route=>{if(route.request().method()==='POST'){requests.push(route.request().postDataJSON());count++;if(count===1){reached();await held}await route.fulfill({status:201,json:{draftId,versionId:count===1?draftId:secondVersion,savedAt:'2025-01-01T00:00:00Z',contentHash:'a'.repeat(64)}})}else if(count>0 && ['failed refresh','unauthorized refresh','forbidden refresh','conflict refresh'].includes(scenario)) await route.fulfill({status:scenario==='unauthorized refresh'?401:scenario==='forbidden refresh'?403:scenario==='conflict refresh'?409:503});else await route.fulfill({status:200,json:{drafts:[],nextCursor:null}})})
    page.on('dialog',dialog=>void dialog.accept());await page.goto(base)
    const nav=(name:string)=>page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name,exact:true}).click()
    await nav('Local recovery');await page.getByLabel('Import metadata files').setInputFiles({name:'ro-crate-metadata.json',mimeType:'application/json',buffer:Buffer.from(output.files.get('ro-crate-metadata.json') as string)});await page.getByText('Recovery opened.',{exact:false}).first().waitFor();await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor()
    await nav('Local account');await page.getByRole('button',{name:'Save local draft',exact:true}).click();await sent
    if(scenario==='newer oversized edit') {await nav('Study details');await page.getByLabel('Description').evaluate(input=>{const field=input as HTMLTextAreaElement;field.value='z'.repeat(17*1024*1024);field.dispatchEvent(new Event('input',{bubbles:true}))});await page.getByText('Latest changes are not confirmed in browser recovery.',{exact:false}).first().waitFor()}
    else if(scenario==='changed then restored') {await nav('Study details');await page.getByLabel('Description').fill('Temporary change');await page.getByLabel('Description').fill('')}
    else if(scenario==='changed session') session='b'.repeat(64)
    else if(scenario==='failed acknowledgement') await page.evaluate(() => {const original=IDBDatabase.prototype.transaction;(window as unknown as {restoreTransaction:()=>void}).restoreTransaction=()=>{IDBDatabase.prototype.transaction=original};IDBDatabase.prototype.transaction=function(...args){if(this.name==='bijux-account-attempts' && args[1]==='readwrite')throw Error('Simulated acknowledgement failure');return original.apply(this,args)}})
    release();if(scenario==='newer oversized edit' || scenario==='changed then restored')await nav('Local account')
    if(scenario==='changed session') await page.getByText('The local account changed.',{exact:false}).waitFor()
    else if(scenario==='failed acknowledgement') {await page.getByText('Local draft saved, but clearing the pending save could not be confirmed.',{exact:false}).waitFor();await page.getByText('check the retained save before saving again',{exact:false}).waitFor()}
    else if(scenario==='failed refresh' || scenario==='conflict refresh') {await page.getByText('The saved draft list could not be refreshed',{exact:false}).waitFor();await page.getByText(`Local draft saved. Revision ${draftId}`,{exact:false}).waitFor()}
    else if(scenario==='unauthorized refresh' || scenario==='forbidden refresh') {await page.getByText('A local save was confirmed, but the session could not be confirmed',{exact:false}).waitFor();assert.equal(await page.getByText(draftId,{exact:false}).count(),0)}
    else await page.getByText('An earlier snapshot was saved as revision',{exact:false}).waitFor()
    const pending=await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('bijux-account-attempts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{return await new Promise<number>((resolve,reject)=>{const r=db.transaction('attempts').objectStore('attempts').count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}finally{db.close()}})
    assert.equal(pending,scenario==='changed session' || scenario==='failed acknowledgement'?1:0)
    if(scenario==='failed acknowledgement') {
      await page.evaluate(()=>(window as unknown as {restoreTransaction:()=>void}).restoreTransaction())
      await page.getByRole('button',{name:'Save local draft',exact:true}).click();await page.getByText('An earlier pending save was resolved.',{exact:false}).waitFor()
      assert.equal(requests.length,2);assert.equal(requests[1].key,requests[0].key)
    }
    if(scenario==='newer oversized edit') {
      await nav('Study details');assert.equal((await page.getByLabel('Description').inputValue()).length,17*1024*1024);await page.getByLabel('Description').fill('Shorter retry')
      await nav('Local account');await page.getByRole('button',{name:'Save local draft',exact:true}).click();await page.getByText(`Local draft saved. Revision ${secondVersion}`,{exact:false}).waitFor()
      assert.equal(requests.length,2);assert.equal(requests[1].draftId,draftId);assert.equal(requests[1].expectedHead,draftId)
    }
  } finally {await browser?.close();if(server.exitCode===null){const stopped=once(server,'exit');server.kill();await stopped}}
})
