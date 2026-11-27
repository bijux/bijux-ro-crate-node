import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {createServer} from 'node:net'
import {test} from 'node:test'
import {chromium} from 'playwright'
import {applyChange,createDraft} from '@bijux/ro-crate-creator'
import {encodeRecovery} from '../../src/drafts/recovery-codec.js'

for (const scenario of ['different account','same account new session','new recovery selection','programmatic account refresh','session unavailable'] as const) test(`opening a local draft preserves current work after ${scenario}`, async () => {
  const socket=createServer();await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));const address=socket.address();if(!address||typeof address==='string')throw Error('port');const port=address.port;await new Promise<void>(resolve=>socket.close(()=>resolve()))
  const base=`http://127.0.0.1:${port}`,server=spawn(process.execPath,['../../artifacts/web/dist/server/entry.mjs'],{cwd:new URL('../..',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),BSS_MODE:'standalone',BIJUX_LOCAL_REFERENCE:'1',NODE_ENV:'development'},stdio:'ignore'});let browser
  try {
    for(let attempt=0;;attempt++){try{if((await fetch(base)).ok)break}catch{}if(attempt===100||server.exitCode!==null)throw Error('App did not start');await new Promise(resolve=>setTimeout(resolve,100))}
    let draft=createDraft();for(const change of [{type:'add-study'},{type:'set-field',entityId:'./',field:'name',value:'Saved account study'}] as const){const result=applyChange(draft,change);if(result.status!=='applied')throw Error('fixture');draft=result.draft}const recovery=JSON.parse(encodeRecovery({draft,pending:[]})) as unknown
    browser=await chromium.launch({headless:true});const page=await browser.newPage();page.setDefaultTimeout(10000)
    const id='00000000-0000-0000-0000-000000000001';let subject='alice',session='a'.repeat(64),confirmed=false,reached!:()=>void,release!:()=>void
    const entered=new Promise<void>(resolve=>{reached=resolve}),held=new Promise<void>(resolve=>{release=resolve})
    await page.route('**/api/local/session',async route=>{if(confirmed && scenario==='session unavailable')return route.fulfill({status:503});if(confirmed && (scenario==='new recovery selection'||scenario==='programmatic account refresh')){confirmed=false;reached();await held}await route.fulfill({status:200,json:{issuer:'fixture',subject,session}})})
    await page.route('**/api/local/drafts',route=>route.fulfill({status:200,json:{drafts:[{draftId:id,versionId:id,savedAt:'2025-01-01T00:00:00Z'}],nextCursor:null}}))
    await page.route(`**/api/local/drafts/${id}`,route=>route.fulfill({status:200,json:{versionId:id,savedAt:'2025-01-01T00:00:00Z',recovery}}))
    page.on('dialog',dialog=>{confirmed=true;if(scenario==='different account')subject='bob';if(scenario==='different account'||scenario==='same account new session')session='b'.repeat(64);void dialog.accept()})
    await page.goto(base);await page.getByRole('button',{name:'Create study'}).click();await page.getByLabel('Study title').fill('Current working study');await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor()
    const nav=(name:string)=>page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name,exact:true}).click()
    await nav('Local account');await page.locator(`#account-draft option[value="${id}"]`).waitFor({state:'attached'});await page.locator('#account-draft').selectOption(id);await page.getByRole('button',{name:'Open saved local draft'}).click()
    if(scenario==='new recovery selection') {
      await entered;await nav('Local recovery');await page.getByLabel('Import metadata files').setInputFiles({name:'ro-crate-metadata.json',mimeType:'application/json',buffer:Buffer.from('{"@context":"https://example.org/unsupported","@graph":[]}')});await page.getByText('This backup is read-only:',{exact:false}).waitFor();release()
      await nav('Local account');await page.getByRole('button',{name:'Refresh saved drafts'}).waitFor({state:'visible'});await page.waitForFunction(()=>{const button=Array.from(document.querySelectorAll('button')).find(item=>item.textContent?.includes('Refresh saved drafts'));return !!button&&!button.disabled});await nav('Local recovery');await page.getByText('This backup is read-only:',{exact:false}).waitFor()
    } else if(scenario==='programmatic account refresh') {
      await entered
      // An adversarial dispatch exercises cancellation even though the UI disables this button while busy.
      const refreshed=page.waitForResponse(response=>response.url().endsWith('/api/local/drafts') && response.request().method()==='GET')
      await page.getByRole('button',{name:'Refresh saved drafts'}).evaluate(button=>button.dispatchEvent(new MouseEvent('click',{bubbles:true})));await refreshed;release()
      await page.getByText('The account or draft changed. Your current work remains open.',{exact:false}).waitFor()
    } else if(scenario==='session unavailable') await page.getByText('The local session could not be confirmed.',{exact:false}).waitFor()
    else await page.getByText('The local account changed.',{exact:false}).waitFor()
    await nav('Study details');assert.equal(await page.getByLabel('Study title').inputValue(),'Current working study');assert.equal(await page.getByText('Local draft opened.',{exact:false}).count(),0)
  } finally {await browser?.close();if(server.exitCode===null){const stopped=once(server,'exit');server.kill();await stopped}}
})

for (const {choice,lateHead} of [{choice:'Recover retained save as new local draft',lateHead:false},{choice:'Open confirmed server revision',lateHead:false},{choice:'Open confirmed server revision',lateHead:true}] as const) test(`${choice} does not adopt after a session change${lateHead ? ' during head fetch' : ''}`, async () => {
  const socket=createServer();await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));const address=socket.address();if(!address||typeof address==='string')throw Error('port');const port=address.port;await new Promise<void>(resolve=>socket.close(()=>resolve()))
  const base=`http://127.0.0.1:${port}`,server=spawn(process.execPath,['../../artifacts/web/dist/server/entry.mjs'],{cwd:new URL('../..',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),BSS_MODE:'standalone',BIJUX_LOCAL_REFERENCE:'1',NODE_ENV:'development'},stdio:'ignore'});let browser
  try {
    for(let attempt=0;;attempt++){try{if((await fetch(base)).ok)break}catch{}if(attempt===100||server.exitCode!==null)throw Error('App did not start');await new Promise(resolve=>setTimeout(resolve,100))}
    let draft=createDraft();for(const change of [{type:'add-study'},{type:'set-field',entityId:'./',field:'name',value:'Retained account study'}] as const){const result=applyChange(draft,change);if(result.status!=='applied')throw Error('fixture');draft=result.draft}const recovery=encodeRecovery({draft,pending:[]})
    browser=await chromium.launch({headless:true});const page=await browser.newPage();page.setDefaultTimeout(10000)
    const id='00000000-0000-0000-0000-000000000001';let session='a'.repeat(64),holdHead=false,reachedHead!:()=>void,releaseHead!:()=>void
    const headEntered=new Promise<void>(resolve=>{reachedHead=resolve}),headHeld=new Promise<void>(resolve=>{releaseHead=resolve})
    await page.route('**/api/local/session',route=>route.fulfill({status:200,json:{issuer:'fixture',subject:'alice',session}}))
    await page.route('**/api/local/drafts',route=>route.fulfill({status:200,json:{drafts:[{draftId:id,versionId:id,savedAt:'2025-01-01T00:00:00Z'}],nextCursor:null}}))
    await page.route(`**/api/local/drafts/${id}`,async route=>{if(holdHead){holdHead=false;reachedHead();await headHeld}await route.fulfill({status:200,json:{versionId:id,savedAt:'2025-01-01T00:00:00Z',recovery:JSON.parse(recovery)}})})
    await page.goto(base);await page.getByRole('button',{name:'Create study'}).click();await page.getByLabel('Study title').fill('Current working study');await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor()
    await page.evaluate(async ({id,recovery})=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('bijux-account-attempts',1);request.onupgradeneeded=()=>request.result.createObjectStore('attempts',{keyPath:'owner'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('attempts','readwrite');tx.objectStore('attempts').put({owner:JSON.stringify(['fixture','alice']),attempt:{key:'pending-key',recovery,draftId:id,expectedHead:id}});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error)})}finally{db.close()}},{id,recovery})
    const nav=(name:string)=>page.locator('aside[aria-label="Study navigation"]').getByRole('link',{name,exact:true}).click();await nav('Local account');await page.getByRole('button',{name:'Refresh saved drafts'}).click();await page.getByRole('button',{name:'Compare retained save'}).waitFor();await page.getByRole('button',{name:'Compare retained save'}).click();await page.getByText('Comparison ready.',{exact:false}).waitFor()
    page.on('dialog',dialog=>{if(lateHead)holdHead=true;else session='b'.repeat(64);void dialog.accept()});await page.getByRole('button',{name:choice}).click();if(lateHead){await headEntered;session='b'.repeat(64);releaseHead()}await page.getByText('The local account changed.',{exact:false}).waitFor()
    await nav('Study details');assert.equal(await page.getByLabel('Study title').inputValue(),'Current working study')
  } finally {await browser?.close();if(server.exitCode===null){const stopped=once(server,'exit');server.kill();await stopped}}
})
