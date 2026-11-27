import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {readFile} from 'node:fs/promises'
import {createServer} from 'node:net'
import test from 'node:test'
import {chromium, type Page} from 'playwright'
import {applyChange, createDraft, materializeDraft} from '@bijux/ro-crate-creator'

async function recoveryRecords(page:Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve,reject) => {const request = indexedDB.open('bijux-draft-recovery'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)})
    const records = await new Promise<Array<{id:string; revision:number; backup:string}>>((resolve,reject) => {const request = db.transaction('drafts').objectStore('drafts').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)})
    db.close(); return records
  })
}

test('recovery failure keeps earlier saved work and provides honest export guidance', async () => {
  let draft = createDraft()
  for (const change of [{type:'add-study'}, {type:'set-field',entityId:'./',field:'name',value:'Previously saved study'}] as const) {
    const result = applyChange(draft, change); if (result.status !== 'applied') throw Error('fixture'); draft = result.draft
  }
  const materialized = materializeDraft(draft)
  if (materialized.status !== 'materialized') throw Error('fixture')
  const metadata = materialized.files.get('ro-crate-metadata.json'); if (typeof metadata !== 'string') throw Error('fixture')
  const reservation = createServer(); await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const address = reservation.address(); if (!address || typeof address === 'string') throw Error('port')
  const port = address.port; await new Promise<void>(resolve => reservation.close(() => resolve()))
  const base = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {cwd:new URL('..', import.meta.url), env:{...process.env,HOST:'127.0.0.1',PORT:String(port),BSS_MODE:'standalone',BIJUX_LOCAL_REFERENCE:'0'},stdio:'ignore'})
  let browser
  try {
    for (let attempt = 0;; attempt++) {try {if ((await fetch(base)).ok) break} catch {} if (attempt === 100 || server.exitCode !== null) throw Error('App did not start'); await new Promise(resolve => setTimeout(resolve,100))}
    browser = await chromium.launch({headless:true})
    const context = await browser.newContext({acceptDownloads:true}), page = await context.newPage()
    page.setDefaultTimeout(20000); page.on('dialog', dialog => void dialog.accept())
    const nav = (name:string) => page.getByRole('navigation',{name:'Study sections',exact:true}).getByRole('link',{name,exact:true}).click()
    await page.goto(base); await nav('Local recovery')
    await page.getByLabel('Import metadata files').setInputFiles({name:'ro-crate-metadata.json',mimeType:'application/json',buffer:Buffer.from(metadata)})
    await page.getByText('Recovery opened.',{exact:false}).first().waitFor()
    await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor()
    const before = await recoveryRecords(page); assert.equal(before.length, 1)
    await nav('Study details')
    await page.getByLabel('Description').evaluate(input => {const field = input as HTMLTextAreaElement; field.value = 'x'.repeat(17 * 1024 * 1024); field.dispatchEvent(new Event('input',{bubbles:true}))})
    await page.getByText('Latest changes are not confirmed in browser recovery.',{exact:false}).first().waitFor()
    assert.deepEqual(await recoveryRecords(page), before)
    assert.equal(await page.evaluate(() => {const event = new Event('beforeunload',{cancelable:true}); window.dispatchEvent(event); return event.defaultPrevented}), true)
    await nav('Local recovery')
    await page.getByLabel('Available recovery copy').selectOption(before[0].id)
    const [older] = await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download selected copy'}).click()])
    const oldPath = await older.path(); if (!oldPath) throw Error('Recovery download unavailable')
    assert.equal(await readFile(oldPath,'utf8'),before[0].backup)
    assert.deepEqual(await recoveryRecords(page),before)
    assert.match(await page.locator('.local-status').innerText(), /Latest changes are not confirmed in browser recovery/)
    await page.addScriptTag({content:`
      const original = File.prototype.arrayBuffer
      const state = {started:false, delivered:false, confirmations:0, release:() => {}}
      const gate = new Promise(resolve => {state.release = resolve})
      window.heldRecovery = state
      File.prototype.arrayBuffer = async function () {
        const bytes = await original.call(this)
        if (this.name === 'held.json') {state.started = true; await gate; state.delivered = true}
        return bytes
      }
      window.confirm = () => {state.confirmations++; return false}
    `})
    await page.getByLabel('Open a full backup').setInputFiles({name:'held.json',mimeType:'application/json',buffer:Buffer.from(before[0].backup)})
    await page.waitForFunction(() => (window as unknown as {heldRecovery:{started:boolean}}).heldRecovery.started)
    await page.getByLabel('Open a full backup').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('not json')})
    await page.getByText('Recovery rejected:',{exact:false}).first().waitFor()
    await page.evaluate(() => (window as unknown as {heldRecovery:{release:() => void}}).heldRecovery.release())
    await page.waitForFunction(() => (window as unknown as {heldRecovery:{delivered:boolean}}).heldRecovery.delivered)
    await page.waitForTimeout(250)
    assert.equal(await page.evaluate(() => (window as unknown as {heldRecovery:{confirmations:number}}).heldRecovery.confirmations),0)
    assert.match(await page.locator('.local-status').innerText(), /Latest changes are not confirmed in browser recovery/)
    await page.getByText('Recovery rejected:',{exact:false}).first().waitFor()
    await page.getByRole('button',{name:'Download editable backup'}).click()
    await page.getByText('Backup could not be created:',{exact:false}).waitFor()
    assert.match(await page.locator('.local-status').innerText(), /Latest changes are not confirmed in browser recovery/)
    await page.getByText('Metadata export may be available',{exact:false}).first().waitFor()
    await page.getByText('Metadata export does not include image contents or unfinished input.',{exact:false}).waitFor()
    await page.getByRole('link',{name:'Open metadata export'}).click()
    await page.evaluate(() => {
      ;(window as unknown as {originalCreateObjectURL:typeof URL.createObjectURL}).originalCreateObjectURL = URL.createObjectURL
      URL.createObjectURL = () => {throw Error('Download unavailable')}
    })
    await page.getByRole('button',{name:'Download metadata',exact:true}).click()
    await page.getByText('Metadata export could not be created:',{exact:false}).waitFor()
    assert.match(await page.locator('.local-status').innerText(), /Latest changes are not confirmed in browser recovery/)
    await page.evaluate(() => {URL.createObjectURL = (window as unknown as {originalCreateObjectURL:typeof URL.createObjectURL}).originalCreateObjectURL})
    const [download] = await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download metadata',exact:true}).click()])
    const path = await download.path(); if (!path) throw Error('Metadata download unavailable')
    const result = JSON.parse(await readFile(path,'utf8')) as {'@graph':Array<Record<string,unknown>>}
    assert.equal((result['@graph'].find(node => node['@id'] === './')?.description as string).length,17 * 1024 * 1024)
    await nav('Study details'); await page.getByLabel('Description').fill('Shortened edit')
    await page.getByText('Recovery copy saved in this browser.',{exact:false}).first().waitFor()
    const after = await recoveryRecords(page); assert.equal(after.length,1); assert.ok(after[0].revision > before[0].revision); assert.match(after[0].backup,/Shortened edit/)
    await nav('Local recovery')
    await page.getByText('This is the result of the last editable-backup attempt.',{exact:false}).waitFor()
    await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download editable backup'}).click()])
    assert.equal(await page.getByText('Backup could not be created:',{exact:false}).count(),0)
    await context.close()
  } finally {await browser?.close(); if (server.exitCode === null) {const stopped = once(server,'exit'); server.kill(); await stopped}}
})
