import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {createServer} from 'node:net'
import {test} from 'node:test'
import {chromium} from 'playwright'
import {applyChange,createDraft,importCrate,materializeDraft,type DraftChange} from '@bijux/ro-crate-creator'
import {encodeRecovery} from '../../src/drafts/recovery-codec.js'

test('rejected record text survives section changes and blocks unsafe actions', async () => {
  let draft=createDraft()
  const step=(change:DraftChange) => {const result=applyChange(draft,change); if(result.status!=='applied') throw Error('fixture'); draft=result.draft; return result.entityId}
  step({type:'add-study'})
  const sample=step({type:'add-entity',kind:'biosample'})
  const dataset=step({type:'add-entity',kind:'dataset'})
  const contributor=step({type:'add-entity',kind:'contributor'})
  const protocol=step({type:'add-entity',kind:'acquisition-protocol'})
  const materialized=materializeDraft(draft); if(materialized.status!=='materialized') throw Error('materialize fixture')
  const imported=await importCrate(new Map([['ro-crate-metadata.json',materialized.files.get('ro-crate-metadata.json') as string]]),{metadataPaths:['ro-crate-metadata.json']})
  if(imported.status!=='editable') throw Error('import fixture')
  const backup=encodeRecovery({draft:imported.draft,pending:[],pendingTerms:[{kind:'taxonomy',entityId:sample,previousId:null,identifier:'',label:'Preserve organism'}]})
  const reservation=createServer(); await new Promise<void>(resolve=>reservation.listen(0,'127.0.0.1',resolve))
  const address=reservation.address(); if(!address || typeof address==='string') throw Error('port')
  const port=address.port; await new Promise<void>(resolve=>reservation.close(()=>resolve()))
  const base=`http://127.0.0.1:${port}`
  const server=spawn(process.execPath,['../../artifacts/web/dist/server/entry.mjs'],{cwd:new URL('../..',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),BSS_MODE:'standalone',BIJUX_LOCAL_REFERENCE:'1',NODE_ENV:'development'},stdio:'ignore'})
  let browser
  try {
    for(let attempt=0;;attempt++) {try {if((await fetch(base)).ok) break} catch {} if(attempt===100 || server.exitCode!==null) throw Error('App did not start'); await new Promise(resolve=>setTimeout(resolve,100))}
    browser=await chromium.launch({headless:true}); const page=await browser.newPage(); page.setDefaultTimeout(30000)
    await page.addInitScript({content:"Object.defineProperty(navigator, 'clipboard', {value: {writeText: async text => {window.copied = text}}})"})
    let cancelDiscard=true
    page.on('dialog',dialog=>{if(cancelDiscard && dialog.message()==='Discard this unsaved record text?'){cancelDiscard=false;void dialog.dismiss()}else void dialog.accept()})
    await page.route('**/api/local/session',route=>route.fulfill({status:200,json:{issuer:'fixture',subject:'alice',session:'a'.repeat(64)}}))
    await page.route('**/api/local/drafts',route=>route.fulfill({status:200,json:{drafts:[],nextCursor:null}}))
    await page.goto(base)
    const nav=(name:string)=>page.getByRole('navigation',{name:'Study sections',exact:true}).getByRole('link',{name,exact:true}).click()
    await nav('Local account'); await page.getByRole('button',{name:'Save local draft',exact:true}).waitFor()
    await nav('Local recovery'); await page.getByLabel('Open a full backup').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)}); await page.getByText('Recovery opened.',{exact:false}).first().waitFor()
    const entries = [
      {section:'Biosamples',label:'Biosample description 1',id:sample,field:'description'},
      {section:'Datasets',label:'Dataset description 1',id:dataset,field:'description'},
      {section:'Contributors',label:'Contributor name 1',id:contributor,field:'name'},
      {section:'Contributors',label:'Roles 1',id:contributor,field:'roles',roles:true},
      {section:'Protocols',label:'Acquisition protocol description 1',id:protocol,field:'description'},
    ]
    for (const entry of entries) {
      await nav(entry.section); await page.getByLabel(entry.label).fill('Earlier value')
      await page.getByLabel(entry.label).evaluate((input,options) => {const field=input as HTMLInputElement | HTMLTextAreaElement; field.value=options.roles ? '  '+'z'.repeat(options.size*1024*1024)+' , editor  ' : 'z'.repeat(options.size*1024*1024)+'\ud800'; field.dispatchEvent(new Event(options.roles ? 'change' : 'input',{bubbles:true}))},{size:17,roles:entry.roles ?? false})
      await page.getByRole('button',{name:`Copy ${entry.field} for ${entry.id} as JSON`}).waitFor()
      await nav('Study details'); await nav(entry.section)
      await page.waitForFunction(({label,length}) => {const element=[...document.querySelectorAll('label')].find(item=>item.textContent===label); const input=element?.htmlFor ? document.getElementById(element.htmlFor) as HTMLInputElement | null : null; return input?.value.length===length},{label:entry.label,length:17*1024*1024+(entry.roles ? 13 : 1)})
      if (entry.id === sample) continue
      assert.equal(await page.getByRole('button',{name:`Retry description for ${sample}`}).count(),1)
      if (entry.field === 'name' || entry.field === 'roles') {
        await page.getByRole('button',{name:`Copy ${entry.field} for ${entry.id} as JSON`}).click()
        await page.getByText('Copied record text as JSON.').first().waitFor()
        assert.equal(await page.evaluate(({id,roles}) => {const copied=JSON.parse((window as unknown as {copied:string}).copied) as {entityId:string;field:string;value:string};return copied.entityId===id && copied.field===(roles?'roles':'name') && copied.value===(roles?'  '+'z'.repeat(17*1024*1024)+' , editor  ':'z'.repeat(17*1024*1024)+'\ud800')},{id:contributor,roles:entry.field==='roles'}),true)
      }
      if (entry.field === 'roles') {
        await page.getByLabel('Roles 1').fill('  curator ,  reviewer  '); await page.getByLabel('Roles 1').press('Tab')
        await page.waitForFunction(() => {const label=[...document.querySelectorAll('label')].find(item=>item.textContent==='Roles 1'); const input=label?.htmlFor ? document.getElementById(label.htmlFor) as HTMLInputElement | null : null; return input?.value==='curator, reviewer'})
        assert.equal(await page.getByRole('button',{name:`Retry roles for ${contributor}`}).count(),0)
      } else {
        if (entry.id === dataset) {
          await page.getByRole('button',{name:`Discard ${entry.field} for ${entry.id}`}).click()
          assert.equal(await page.getByRole('button',{name:`Retry ${entry.field} for ${entry.id}`}).count(),1)
        }
        await page.getByRole('button',{name:`Discard ${entry.field} for ${entry.id}`}).click()
      }
    }
    assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented}),true)
    await nav('Biosamples'); await page.getByRole('button',{name:'Delete biosample 1'}).click(); await page.getByText('Resolve unsaved text for this record before deleting it.',{exact:false}).waitFor()
    await nav('Validate crate'); await page.getByText('Resolve unsaved text before validation.',{exact:false}).first().waitFor(); assert.equal(await page.getByRole('button',{name:'Continue',exact:true}).isDisabled(),true)
    await nav('Export metadata'); assert.equal(await page.getByRole('button',{name:'Download metadata',exact:true}).isDisabled(),true)
    await nav('Local account'); assert.equal(await page.getByRole('button',{name:'Save local draft',exact:true}).count(),0)
    await nav('Local recovery'); await page.getByRole('button',{name:'Download editable backup'}).click(); await page.getByText('Resolve unsaved text before downloading an editable backup',{exact:false}).waitFor()
    await page.getByLabel('Open a full backup').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)}); await page.getByText('Resolve unsaved text before opening another draft.',{exact:false}).waitFor()
    await page.getByRole('button',{name:'Discard all unfinished vocabulary input'}).click()
    await page.getByRole('button',{name:`Retry description for ${sample}`}).click(); assert.equal(await page.getByRole('button',{name:`Retry description for ${sample}`}).count(),1)
    await nav('Biosamples'); await page.getByLabel('Biosample description 1').fill('Recoverable correction')
    assert.equal(await page.getByRole('button',{name:`Retry description for ${sample}`}).count(),0)
    assert.equal(await page.getByRole('heading',{name:'Unsaved record text'}).count(),0)
    await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor()
    const recovered = await page.evaluate(async () => {const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('bijux-draft-recovery');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});const records=await new Promise<Array<{backup:string}>>((resolve,reject)=>{const request=db.transaction('drafts').objectStore('drafts').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});db.close();return records.map(record=>(JSON.parse(record.backup) as {creator:{snapshot:{entities:Array<{id:string;description?:string}>}}}).creator.snapshot.entities)})
    assert.ok(recovered.some(entities=>entities.some(entity=>entity.id===sample && entity.description==='Recoverable correction')))
  } finally {await browser?.close(); if(server.exitCode===null) {const stopped=once(server,'exit');server.kill();await stopped}}
})

test('retrying roles after reducing the imported draft preserves their parsed values', async () => {
  let draft=createDraft()
  const step=(change:DraftChange) => {const result=applyChange(draft,change); if(result.status!=='applied') throw Error('fixture'); draft=result.draft; return result.entityId}
  step({type:'add-study'}); const sample=step({type:'add-entity',kind:'biosample'}); const contributor=step({type:'add-entity',kind:'contributor'})
  const materialized=materializeDraft(draft); if(materialized.status!=='materialized') throw Error('fixture export')
  const imported=await importCrate(new Map([['ro-crate-metadata.json',materialized.files.get('ro-crate-metadata.json') as string]]),{metadataPaths:['ro-crate-metadata.json']})
  if(imported.status!=='editable') throw Error('fixture import')
  const oversized=applyChange(imported.draft,{type:'set-field',entityId:'./',field:'description',value:'x'.repeat(16*1024*1024)})
  if(oversized.status!=='applied') throw Error('fixture oversized draft')
  const output=materializeDraft(oversized.draft); if(output.status!=='materialized') throw Error('fixture materialization')
  const size=[...output.files.values()].reduce((sum,value)=>sum+(typeof value==='string'?new TextEncoder().encode(value).length:value instanceof Uint8Array?value.length:0),0)
  const nearLimit=applyChange(imported.draft,{type:'set-field',entityId:'./',field:'description',value:'x'.repeat(16*1024*1024-(size-16*1024*1024)-200)})
  if(nearLimit.status!=='applied') throw Error('fixture near-limit draft')
  const pendingTerms=[{kind:'taxonomy' as const,entityId:sample,previousId:null,identifier:'',label:'Unfinished organism'}]
  const backup=encodeRecovery({draft:nearLimit.draft,pending:[],pendingTerms})
  const role='r'.repeat(500), attempted=applyChange(nearLimit.draft,{type:'set-roles',entityId:contributor,roles:[role,'editor']})
  if(attempted.status!=='applied') throw Error('fixture roles')
  assert.throws(()=>encodeRecovery({draft:attempted.draft,pending:[],pendingTerms}),/size limit/)
  const reservation=createServer();await new Promise<void>(resolve=>reservation.listen(0,'127.0.0.1',resolve))
  const address=reservation.address();if(!address||typeof address==='string')throw Error('port')
  const port=address.port;await new Promise<void>(resolve=>reservation.close(()=>resolve()))
  const base=`http://127.0.0.1:${port}`
  const server=spawn(process.execPath,['../../artifacts/web/dist/server/entry.mjs'],{cwd:new URL('../..',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),BSS_MODE:'standalone',BIJUX_LOCAL_REFERENCE:'0'},stdio:'ignore'})
  let browser
  try {
    for(let attempt=0;;attempt++){try{if((await fetch(base)).ok)break}catch{}if(attempt===100||server.exitCode!==null)throw Error('App did not start');await new Promise(resolve=>setTimeout(resolve,100))}
    browser=await chromium.launch({headless:true});const page=await browser.newPage({acceptDownloads:true});page.setDefaultTimeout(30000);page.on('dialog',dialog=>void dialog.accept())
    await page.goto(base);const nav=(name:string)=>page.getByRole('navigation',{name:'Study sections',exact:true}).getByRole('link',{name,exact:true}).click()
    await nav('Local recovery');await page.getByLabel('Open a full backup').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});await page.getByText('Recovery opened.',{exact:false}).first().waitFor()
    await nav('Contributors');await page.getByLabel('Roles 1').fill(`  ${role} , editor  `);await page.getByLabel('Roles 1').press('Tab')
    await page.getByRole('button',{name:`Retry roles for ${contributor}`}).waitFor()
    await nav('Study details');await page.getByLabel('Description').fill('Shortened source')
    await page.getByRole('button',{name:`Retry roles for ${contributor}`}).click()
    assert.equal(await page.getByRole('button',{name:`Retry roles for ${contributor}`}).count(),0)
    await nav('Contributors');await page.waitForFunction(expected=>{const label=[...document.querySelectorAll('label')].find(item=>item.textContent==='Roles 1');const input=label?.htmlFor ? document.getElementById(label.htmlFor) as HTMLInputElement|null : null;return input?.value===expected},`${role}, editor`)
    await nav('Local recovery');const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download editable backup'}).click();const file=await downloading;const stream=await file.createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString()
    const result=JSON.parse(text) as {creator:{snapshot:{entities:Array<{id:string;role?:string[]}>}}}
    assert.deepEqual(result.creator.snapshot.entities.find(entity=>entity.id===contributor)?.role,[role,'editor'])
  } finally {await browser?.close();if(server.exitCode===null){const stopped=once(server,'exit');server.kill();await stopped}}
})
