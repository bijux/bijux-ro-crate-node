import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {createServer} from 'node:net'
import {test} from 'node:test'
import {chromium} from 'playwright'
import {applyChange, createDraft, importCrate, materializeDraft} from '@bijux/ro-crate-creator'
import {encodeRecovery} from '../../src/drafts/recovery-codec.js'

test('rejected study text remains available until it can be recovered or is discarded', async () => {
  let draft = createDraft()
  const study = applyChange(draft,{type:'add-study'}); if (study.status !== 'applied') throw Error('study fixture'); draft = study.draft
  const sample = applyChange(draft,{type:'add-entity',kind:'biosample'}); if (sample.status !== 'applied') throw Error('sample fixture'); draft = sample.draft
  const materialized = materializeDraft(draft); if (materialized.status !== 'materialized') throw Error('materialize fixture')
  const imported = await importCrate(new Map([['ro-crate-metadata.json',materialized.files.get('ro-crate-metadata.json') as string]]),{metadataPaths:['ro-crate-metadata.json']})
  if (imported.status !== 'editable') throw Error('import fixture')
  const backup = encodeRecovery({draft:imported.draft,pending:[],pendingTerms:[{kind:'taxonomy',entityId:sample.entityId,previousId:null,identifier:'',label:'Preserve organism'}]})
  const reservation = createServer(); await new Promise<void>(resolve => reservation.listen(0,'127.0.0.1',resolve))
  const address = reservation.address(); if (!address || typeof address === 'string') throw Error('port')
  const port = address.port; await new Promise<void>(resolve => reservation.close(() => resolve()))
  const base = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath,['../../artifacts/web/dist/server/entry.mjs'],{cwd:new URL('../..',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),BSS_MODE:'standalone',BIJUX_LOCAL_REFERENCE:'1',NODE_ENV:'development'},stdio:'ignore'})
  let browser
  try {
    for (let attempt=0;;attempt++) {try {if ((await fetch(base)).ok) break} catch {} if (attempt===100 || server.exitCode!==null) throw Error('App did not start'); await new Promise(resolve => setTimeout(resolve,100))}
    browser = await chromium.launch({headless:true}); const page = await browser.newPage(); page.setDefaultTimeout(30000)
    await page.addInitScript({content:"Object.defineProperty(navigator, 'clipboard', {value: {writeText: async text => {window.copied = text}}})"})
    let cancelDiscard = true
    page.on('dialog',dialog => {if (cancelDiscard && dialog.message().startsWith('Discard the unsaved')) {cancelDiscard = false; void dialog.dismiss()} else void dialog.accept()})
    await page.route('**/api/local/session',route => route.fulfill({status:200,json:{issuer:'fixture',session:'a'.repeat(64),subject:'alice'}}))
    await page.route('**/api/local/drafts',route => route.fulfill({status:200,json:{drafts:[],nextCursor:null}}))
    await page.goto(base)
    const nav = (name:string) => page.getByRole('navigation',{name:'Study sections',exact:true}).getByRole('link',{name,exact:true}).click()
    await nav('Local account'); await page.getByRole('button',{name:'Save local draft',exact:true}).waitFor()
    await nav('Local recovery'); await page.getByLabel('Open a full backup').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)}); await page.getByText('Recovery opened.',{exact:false}).first().waitFor()
    await page.addScriptTag({content:`{
      const state = {locked:false, release:false, queued:false, completed:false}
      window.heldSave = state
      const open = indexedDB.open('bijux-draft-recovery')
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction('drafts','readwrite'), store = tx.objectStore('drafts')
        const transaction = IDBDatabase.prototype.transaction
        IDBDatabase.prototype.transaction = function (...args) {
          const result = transaction.apply(this,args)
          if (this.name === 'bijux-draft-recovery' && args[1] === 'readwrite') {state.queued = true; result.addEventListener('complete', () => {state.completed = true})}
          return result
        }
        function keepAlive() {const request = store.count(); request.onsuccess = () => {state.locked = true; if (!state.release) keepAlive()}}
        tx.oncomplete = () => db.close()
        keepAlive()
      }
    }`})
    await page.waitForFunction(() => (window as unknown as {heldSave:{locked:boolean}}).heldSave.locked)
    await page.addScriptTag({content:`{
      const read = File.prototype.arrayBuffer
      const state = {started:false, release:() => {}}
      const gate = new Promise(resolve => {state.release = resolve})
      window.delayedBackup = state
      File.prototype.arrayBuffer = async function () {const bytes = await read.call(this); if (this.name === 'delayed.json') {state.started = true; await gate} return bytes}
    }`})
    await page.getByLabel('Open a full backup').setInputFiles({name:'delayed.json',mimeType:'application/json',buffer:Buffer.from(backup)})
    await page.waitForFunction(() => (window as unknown as {delayedBackup:{started:boolean}}).delayedBackup.started)
    await nav('Study details')
    await page.getByLabel('Description').fill('Earlier admitted text')
    await page.waitForFunction(() => (window as unknown as {heldSave:{queued:boolean}}).heldSave.queued)
    await page.getByLabel('Description').evaluate(input => {const field = input as HTMLTextAreaElement; field.value = 'z'.repeat(17 * 1024 * 1024) + '\ud800'; field.dispatchEvent(new Event('input',{bubbles:true}))})
    await page.getByRole('heading',{name:'Unsaved study text'}).waitFor()
    await page.evaluate(() => {(window as unknown as {heldSave:{release:boolean}}).heldSave.release = true})
    await page.waitForFunction(() => (window as unknown as {heldSave:{completed:boolean}}).heldSave.completed)
    await page.getByText('Unsaved text is not included in browser recovery.',{exact:false}).first().waitFor()
    assert.equal(await page.locator('.local-status').getByText('Recovery copy saved in this browser.',{exact:false}).count(),0)
    await page.evaluate(() => (window as unknown as {delayedBackup:{release:() => void}}).delayedBackup.release())
    await page.getByText('Resolve unsaved text before opening another draft.',{exact:false}).waitFor()
    assert.equal((await page.getByLabel('Description').inputValue()).length,17 * 1024 * 1024 + 1)
    await page.getByRole('button',{name:'Discard Description'}).click()
    assert.equal(await page.getByRole('heading',{name:'Unsaved study text'}).count(),1)
    await page.getByLabel('Study title').evaluate(input => {const field = input as HTMLInputElement; field.value = 'x'.repeat(17 * 1024 * 1024); field.dispatchEvent(new Event('input',{bubbles:true}))})
    await page.getByRole('button',{name:'Discard Study title'}).click()
    assert.equal(await page.getByRole('button',{name:'Discard Study title'}).count(),0)
    assert.equal(await page.getByRole('button',{name:'Discard Description'}).count(),1)
    assert.equal(await page.evaluate(() => {const event = new Event('beforeunload',{cancelable:true}); window.dispatchEvent(event); return event.defaultPrevented}),true)
    await page.getByRole('button',{name:'Copy Description as JSON'}).click()
    await page.getByText('Copied Description as JSON text.').waitFor()
    assert.equal(await page.evaluate(() => {const copy=JSON.parse((window as unknown as {copied:string}).copied) as {field:string;value:string}; return copy.field==='description' && copy.value==='z'.repeat(17*1024*1024)+'\ud800'}),true)
    await nav('Biosamples'); assert.equal(await page.getByLabel('Add organism to biosample 1 label').inputValue(),'Preserve organism')
    await nav('Study details'); await page.waitForFunction(() => (document.querySelector('#description') as HTMLTextAreaElement | null)?.value.length === 17 * 1024 * 1024 + 1)
    await nav('Validate crate'); await page.getByText('Resolve unsaved text before validation.',{exact:false}).first().waitFor(); assert.equal(await page.getByRole('button',{name:'Continue',exact:true}).isDisabled(),true)
    await nav('Export metadata'); assert.equal(await page.getByRole('button',{name:'Download metadata',exact:true}).isDisabled(),true)
    await nav('Local account'); assert.equal(await page.getByRole('button',{name:'Save local draft',exact:true}).count(),0)
    await nav('Local recovery'); await page.getByRole('button',{name:'Download editable backup'}).click(); await page.getByText('Resolve unsaved text before downloading an editable backup',{exact:false}).waitFor()
    await page.getByLabel('Open a full backup').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)}); await page.getByText('Resolve unsaved text before opening another draft.',{exact:false}).waitFor()
    await page.getByRole('button',{name:'Discard all unfinished vocabulary input'}).click(); await page.getByRole('button',{name:'Retry Description'}).click()
    await page.getByRole('heading',{name:'Unsaved study text'}).waitFor()
    assert.equal(await page.getByText('The unfinished vocabulary input remains open.',{exact:false}).count(),0)
    await page.getByText('This change would prevent the draft from being recovered.',{exact:false}).waitFor()
    await nav('Study details'); await page.getByLabel('Description').fill('Short recoverable text')
    assert.equal(await page.getByRole('heading',{name:'Unsaved study text'}).count(),0)
    await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor()
    const descriptions = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve,reject) => {const request=indexedDB.open('bijux-draft-recovery'); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error)})
      const records = await new Promise<Array<{backup:string}>>((resolve,reject) => {const request=db.transaction('drafts').objectStore('drafts').getAll(); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error)})
      db.close()
      return records.map(record => (JSON.parse(record.backup) as {creator:{snapshot:{study:{description?:string}}}}).creator.snapshot.study.description)
    })
    assert.ok(descriptions.includes('Short recoverable text'))
    await nav('Local recovery')
    assert.equal(await page.getByText('Resolve unsaved text before downloading an editable backup',{exact:false}).count(),0)
    assert.equal(await page.getByText('Resolve unsaved text before opening another draft.',{exact:false}).count(),0)
  } finally {await browser?.close(); if (server.exitCode === null) {const stopped=once(server,'exit'); server.kill(); await stopped}}
})
