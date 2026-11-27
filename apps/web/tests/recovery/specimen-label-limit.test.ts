import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {createServer} from 'node:net'
import {test} from 'node:test'
import {chromium} from 'playwright'
import {applyChange,createDraft,importCrate,materializeDraft,type DraftChange} from '@bijux/ro-crate-creator'
import {encodeRecovery} from '../../src/drafts/recovery-codec.js'

test('an oversized rejected specimen label remains available across navigation', async () => {
  let draft=createDraft()
  const step=(change:DraftChange) => {const result=applyChange(draft,change); if(result.status!=='applied') throw Error('fixture'); draft=result.draft; return result.entityId}
  step({type:'add-study'}); const sample=step({type:'add-entity',kind:'biosample'}); const specimen=step({type:'add-entity',kind:'specimen'})
  const materialized=materializeDraft(draft); if(materialized.status!=='materialized') throw Error('materialize fixture')
  const imported=await importCrate(new Map([['ro-crate-metadata.json',materialized.files.get('ro-crate-metadata.json') as string]]),{metadataPaths:['ro-crate-metadata.json']})
  if(imported.status!=='editable') throw Error('import fixture')
  const backup=encodeRecovery({draft:imported.draft,pending:[],pendingTerms:[{kind:'taxonomy',entityId:sample,previousId:null,identifier:'',label:'Preserve organism'}]})
  const reservation=createServer(); await new Promise<void>(resolve=>reservation.listen(0,'127.0.0.1',resolve))
  const address=reservation.address(); if(!address || typeof address==='string') throw Error('port')
  const port=address.port; await new Promise<void>(resolve=>reservation.close(()=>resolve()))
  const base=`http://127.0.0.1:${port}`
  const server=spawn(process.execPath,['../../artifacts/web/dist/server/entry.mjs'],{cwd:new URL('../..',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),BSS_MODE:'standalone',BIJUX_LOCAL_REFERENCE:'0'},stdio:'ignore'})
  let browser
  try {
    for(let attempt=0;;attempt++) {try {if((await fetch(base)).ok) break} catch {} if(attempt===100 || server.exitCode!==null) throw Error('App did not start'); await new Promise(resolve=>setTimeout(resolve,100))}
    browser=await chromium.launch({headless:true}); const page=await browser.newPage(); page.setDefaultTimeout(30000);page.on('dialog',dialog=>void dialog.accept())
    await page.goto(base)
    const nav=(name:string)=>page.getByRole('navigation',{name:'Study sections',exact:true}).getByRole('link',{name,exact:true}).click()
    await nav('Local recovery'); await page.getByLabel('Open a full backup').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)}); await page.getByText('Recovery opened.',{exact:false}).first().waitFor()
    await nav('Specimens'); await page.getByLabel('Specimen label 1').fill('Earlier label')
    await page.getByLabel('Specimen label 1').evaluate(input=>{const field=input as HTMLInputElement;field.value='z'.repeat(65*1024*1024)+'\ud800';field.dispatchEvent(new Event('input',{bubbles:true}))})
    await page.getByRole('button',{name:`Retry label for ${specimen}`}).waitFor()
    await nav('Study details'); await nav('Specimens')
    await page.waitForFunction(()=>(document.querySelector('#specimen-label-0') as HTMLInputElement | null)?.value.length===65*1024*1024+1)
    await page.getByRole('button',{name:`Retry label for ${specimen}`}).click();assert.equal(await page.getByRole('button',{name:`Retry label for ${specimen}`}).count(),1)
    await page.getByLabel('Specimen label 1').fill('Recoverable label')
    assert.equal(await page.getByRole('heading',{name:'Unsaved record text'}).count(),0)
    await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor()
  } finally {await browser?.close(); if(server.exitCode===null) {const stopped=once(server,'exit');server.kill();await stopped}}
})
