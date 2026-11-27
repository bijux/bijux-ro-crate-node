import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {createServer} from 'node:net'
import {test} from 'node:test'
import {chromium} from 'playwright'
import {applyChange, createDraft, importCrate, materializeDraft} from '@bijux/ro-crate-creator'
import {encodeRecovery} from '../../src/drafts/recovery-codec.js'

test('replacement waits for recovery and explicitly warns before discarding failed work', async () => {
  const created=applyChange(createDraft(),{type:'add-study'});if(created.status!=='applied')throw Error('study fixture')
  const materialized=materializeDraft(created.draft);if(materialized.status!=='materialized')throw Error('fixture export')
  const imported=await importCrate(new Map([['ro-crate-metadata.json',materialized.files.get('ro-crate-metadata.json') as string]]),{metadataPaths:['ro-crate-metadata.json']});if(imported.status!=='editable')throw Error('fixture import')
  const backup=encodeRecovery({draft:imported.draft,pending:[]})
  const reservation=createServer();await new Promise<void>(resolve=>reservation.listen(0,'127.0.0.1',resolve));const address=reservation.address();if(!address||typeof address==='string')throw Error('port');const port=address.port;await new Promise<void>(resolve=>reservation.close(()=>resolve()))
  const base=`http://127.0.0.1:${port}`,server=spawn(process.execPath,['../../artifacts/web/dist/server/entry.mjs'],{cwd:new URL('../..',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),BSS_MODE:'standalone',BIJUX_LOCAL_REFERENCE:'0'},stdio:'ignore'})
  let browser
  try {
    for(let attempt=0;;attempt++){try{if((await fetch(base)).ok)break}catch{}if(attempt===100||server.exitCode!==null)throw Error('App did not start');await new Promise(resolve=>setTimeout(resolve,100))}
    browser=await chromium.launch({headless:true});const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(30000)
    const prompts:string[]=[];let accept=true
    page.on('dialog',dialog=>{prompts.push(dialog.message());if(accept)void dialog.accept();else void dialog.dismiss()})
    await page.goto(base);const nav=(name:string)=>page.getByRole('navigation',{name:'Study sections',exact:true}).getByRole('link',{name,exact:true}).click()
    const open=async()=>page.getByLabel('Open a full backup').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)})
    await nav('Local recovery');await open();await page.getByText('Recovery opened.',{exact:false}).first().waitFor();await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor()
    await page.addScriptTag({content:`{
      const state={locked:false,release:false,queued:false,completed:false};window.heldSave=state
      const open=indexedDB.open('bijux-draft-recovery');open.onsuccess=()=>{
        const db=open.result,tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),transaction=IDBDatabase.prototype.transaction
        IDBDatabase.prototype.transaction=function(...args){const result=transaction.apply(this,args);if(this.name==='bijux-draft-recovery'&&args[1]==='readwrite'){state.queued=true;result.addEventListener('complete',()=>{state.completed=true})}return result}
        function keepAlive(){const request=store.count();request.onsuccess=()=>{state.locked=true;if(!state.release)keepAlive()}}
        tx.oncomplete=()=>db.close();keepAlive()
      }
    }`})
    await page.waitForFunction(()=>(window as unknown as {heldSave:{locked:boolean}}).heldSave.locked)
    await nav('Study details');await page.getByLabel('Description').fill('Pending but visible')
    await page.waitForFunction(()=>(window as unknown as {heldSave:{queued:boolean}}).heldSave.queued)
    const priorPrompts=prompts.length;await nav('Local recovery');await open();await page.getByText('Wait for browser recovery to finish before replacing the current study.').first().waitFor();assert.equal(prompts.length,priorPrompts)
    await page.getByLabel('Import metadata files').setInputFiles({name:'ro-crate-metadata.json',mimeType:'application/json',buffer:Buffer.from('{"@context":"https://example.org/unsupported","@graph":[]}')});await page.getByText('This backup is read-only:',{exact:false}).waitFor()
    await nav('Study details');await page.getByLabel('Description').evaluate(input=>{const field=input as HTMLTextAreaElement;field.value='z'.repeat(17*1024*1024);field.dispatchEvent(new Event('input',{bubbles:true}))})
    await page.getByText('Latest changes are not confirmed in browser recovery.',{exact:false}).first().waitFor()
    assert.equal(await page.getByText('Wait for browser recovery to finish before replacing the current study.').count(),0)
    await page.getByLabel('Description').fill('Pending but visible')
    await page.evaluate(()=>{(window as unknown as {heldSave:{release:boolean}}).heldSave.release=true});await page.waitForFunction(()=>(window as unknown as {heldSave:{completed:boolean}}).heldSave.completed);await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor()
    assert.equal(await page.getByText('Wait for browser recovery to finish before replacing the current study.').count(),0)
    await nav('Study details');assert.equal(await page.getByLabel('Description').inputValue(),'Pending but visible')
    await page.getByLabel('Description').evaluate(input=>{const field=input as HTMLTextAreaElement;field.value='z'.repeat(17*1024*1024);field.dispatchEvent(new Event('input',{bubbles:true}))})
    await page.getByText('Latest changes are not confirmed in browser recovery.',{exact:false}).first().waitFor()
    await nav('Local recovery');accept=false;const rejected=page.waitForEvent('dialog');await open();await rejected
    assert.match(prompts.at(-1) ?? '',/not confirmed in browser recovery.*will discard them/i)
    await nav('Study details');assert.equal((await page.getByLabel('Description').inputValue()).length,17*1024*1024)
    await nav('Local recovery');accept=true;const confirmed=page.waitForEvent('dialog');await open();await confirmed;await page.getByText('Recovery opened.',{exact:false}).first().waitFor()
    assert.match(prompts.at(-1) ?? '',/not confirmed in browser recovery.*will discard them/i)
    await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor()
    const records = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve,reject) => {const request=indexedDB.open('bijux-draft-recovery');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
      try {return await new Promise<Array<{id:string;savedAt:number;backup:string}>>((resolve,reject) => {const request=db.transaction('drafts').objectStore('drafts').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})} finally {db.close()}
    })
    assert.ok(records.length >= 2, 'replacement must use a new recovery record')
    assert.ok(records.some(record => record.backup.includes('Pending but visible')), 'previous recovery is retained')
    const current = records.filter(record => !record.backup.includes('Pending but visible')).sort((a,b) => b.savedAt-a.savedAt)[0]
    assert.ok(current)
    const otherTab = await page.context().newPage();await otherTab.goto(base)
    await otherTab.evaluate(async id => {
      const db = await new Promise<IDBDatabase>((resolve,reject) => {const request=indexedDB.open('bijux-draft-recovery');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
      try {await new Promise<void>((resolve,reject) => {const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').delete(id);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error)})} finally {db.close()}
    },current.id);await otherTab.close()
    accept=false;const missing=page.waitForEvent('dialog');await open();await missing
    assert.match(prompts.at(-1) ?? '',/not confirmed in browser recovery.*will discard them/i)
    await nav('Study details');assert.equal(await page.getByLabel('Description').inputValue(),'')
  } finally {await browser?.close();if(server.exitCode===null){const stopped=once(server,'exit');server.kill();await stopped}}
})
