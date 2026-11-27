import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {mkdir, writeFile} from 'node:fs/promises'
import {createServer} from 'node:net'
import test from 'node:test'
import {chromium, firefox, webkit} from 'playwright'
import {applyChange, createDraft, materializeDraft} from '@bijux/ro-crate-creator'
import {decodeRecovery} from '../../src/drafts/recovery-codec.js'

const engines = {chromium,firefox,webkit}
const engineName = process.env.BIJUX_TEST_ENGINE ?? 'chromium'
if (!Object.hasOwn(engines,engineName)) throw Error(`Unsupported browser engine: ${engineName}`)
const engine = engines[engineName as keyof typeof engines]

test('oversize imaging input remains recoverable when applying would exceed imported-source limits', async () => {
  let draft = createDraft()
  for (const change of [{type:'add-study'}, {type:'add-entity',kind:'acquisition-protocol'}] as const) {
    const result = applyChange(draft, change)
    if (result.status !== 'applied') throw Error('fixture')
    draft = result.draft
  }
  const output = materializeDraft(draft)
  if (output.status !== 'materialized') throw Error('fixture')
  const metadata = output.files.get('ro-crate-metadata.json')
  if (typeof metadata !== 'string') throw Error('fixture')
  const socket = createServer()
  await new Promise<void>(resolve => socket.listen(0,'127.0.0.1',resolve))
  const address = socket.address(); if (!address || typeof address === 'string') throw Error('port')
  const port = address.port
  await new Promise<void>(resolve => socket.close(() => resolve()))
  const base = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {cwd:new URL('../..',import.meta.url), env:{...process.env,HOST:'127.0.0.1',PORT:String(port),BSS_MODE:'standalone',BIJUX_LOCAL_REFERENCE:'0'},stdio:'ignore'})
  let browser
  try {
    for (let attempt = 0;; attempt++) {try {if ((await fetch(base)).ok) break} catch {} if (attempt === 100 || server.exitCode !== null) throw Error('Built app did not start'); await new Promise(resolve => setTimeout(resolve,100))}
    browser = await engine.launch({headless:true})
    const page = await browser.newPage({acceptDownloads:true}); page.setDefaultTimeout(15000)
    page.on('dialog', dialog => void dialog.accept())
    await page.goto(base)
    const nav = page.getByRole('navigation',{name:'Study sections',exact:true})
    await nav.getByRole('link',{name:'Local recovery',exact:true}).click()
    await page.getByLabel('Import metadata files').setInputFiles({name:'ro-crate-metadata.json',mimeType:'application/json',buffer:Buffer.from(metadata)})
    await page.getByText('Recovery opened.',{exact:false}).first().waitFor()
    await nav.getByRole('link',{name:'Protocols',exact:true}).click()
    const field = page.getByLabel('Imaging method for acquisition protocol 1 label')
    await field.evaluate(input => {const field = input as HTMLInputElement; field.value = 'x'.repeat(17 * 1024 * 1024); field.dispatchEvent(new Event('input',{bubbles:true}))})
    await page.getByRole('button',{name:'Apply identifier and label for Imaging method for acquisition protocol 1'}).click()
    await page.getByText('This change would prevent the draft from being recovered.',{exact:false}).first().waitFor()
    assert.equal(await field.evaluate(input => (input as HTMLInputElement).value.length), 17 * 1024 * 1024)
    await nav.getByRole('link',{name:'Local recovery',exact:true}).click()
    const [file] = await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download editable backup'}).click()])
    const chunks:Buffer[] = []; for await (const chunk of await file.createReadStream()) chunks.push(Buffer.from(chunk))
    const restored = await decodeRecovery(Buffer.concat(chunks).toString())
    assert.equal(restored.status, 'decoded')
    if (restored.status !== 'decoded') throw Error('backup was not recoverable')
    assert.equal(restored.pendingTerms[0].label.length, 17 * 1024 * 1024)
    const current = materializeDraft(restored.draft)
    assert.equal(current.status, 'materialized')
    if (current.status === 'materialized') assert.deepEqual(current.files.get('ro-crate-metadata.json'), new TextEncoder().encode(metadata))
  } finally {await browser?.close(); if (server.exitCode === null) {const done=once(server,'exit'); server.kill(); await done}}
})

test('a recovery rejection retains the selected batch for an explicit retry', {timeout:120000}, async () => {
  const {applyChange} = await import('@bijux/ro-crate-creator')
  const {newEditor} = await import('../../src/features/editor/document.js')
  const {encodeRecovery, RECOVERY_MAX_BYTES} = await import('../../src/drafts/recovery-codec.js')
  const study = applyChange(newEditor(), {type:'add-study'}); if (study.status !== 'applied') throw Error('fixture')
  const protocol = applyChange(study.draft, {type:'add-entity',kind:'acquisition-protocol'}); if (protocol.status !== 'applied') throw Error('fixture')
  const pending = [{id:'p:1',path:'a'.repeat(3000),size:'1'}]
  const term = {kind:'imaging' as const,entityId:protocol.entityId,previousId:null,identifier:'',label:''}
  const empty = encodeRecovery({draft:protocol.draft,pending,pendingTerms:[term]})
  const backup = encodeRecovery({draft:protocol.draft,pending,pendingTerms:[{...term,label:'x'.repeat(RECOVERY_MAX_BYTES - Buffer.byteLength(empty) - 10)}]})
  const directory = new URL('../../../../artifacts/file-journey/', import.meta.url); await mkdir(directory,{recursive:true})
  const path = new URL(`near-limit-${engineName}-backup.json`,directory); await writeFile(path,backup)
  const socket = createServer()
  await new Promise<void>(resolve => socket.listen(0,'127.0.0.1',resolve))
  const address = socket.address(); if (!address || typeof address === 'string') throw Error('port')
  const port = address.port
  await new Promise<void>(resolve => socket.close(() => resolve()))
  const base = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {cwd:new URL('../..',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port)},stdio:'ignore'})
  let browser
  try {
    for (let i=0;;i++) {try {if ((await fetch(base)).ok) break} catch {} if (i === 100 || server.exitCode !== null) throw Error('Server did not start'); await new Promise(resolve => setTimeout(resolve,100))}
    browser = await engine.launch({headless:true})
    const page = await browser.newPage(); page.setDefaultTimeout(60000)
    page.on('dialog', dialog => void dialog.accept())
    await page.goto(base)
    const nav = page.getByRole('navigation',{name:'Study sections',exact:true})
    await nav.getByRole('link',{name:'Local recovery',exact:true}).click()
    await page.getByLabel('Open a full backup').setInputFiles(path.pathname)
    await page.getByText('Recovery opened.',{exact:false}).first().waitFor()
    await nav.getByRole('link',{name:'Files',exact:true}).click()
    await page.locator('#file-input').setInputFiles({name:'next.tif',mimeType:'image/tiff',buffer:Buffer.from('a')})
    await page.getByText('The selected files were not added.',{exact:false}).waitFor()
    assert.match(await page.locator('main').innerText(), /1 pending assignment/)
    assert.equal(await page.locator('#file-input').evaluate((input:HTMLInputElement) => input.files?.length),1)
    await nav.getByRole('link',{name:'Local recovery',exact:true}).click()
    await page.locator('#file-input').waitFor({state:'detached'})
    await nav.getByRole('link',{name:'Files',exact:true}).click()
    await page.getByRole('button',{name:'Retry selected files'}).waitFor()
    await nav.getByRole('link',{name:'Local recovery',exact:true}).click()
    await page.getByLabel('Open a full backup').setInputFiles({name:'replacement.json',mimeType:'application/json',buffer:Buffer.from(encodeRecovery({draft:study.draft,pending:[]}))})
    await page.getByText('Recovery opened.',{exact:false}).first().waitFor()
    await page.getByText('These file listings would prevent unfinished vocabulary input from being recovered.',{exact:false}).waitFor({state:'detached'})
    await nav.getByRole('link',{name:'Files',exact:true}).click()
    await page.locator('#file-input').waitFor()
    assert.equal(await page.getByRole('button',{name:'Retry selected files'}).count(),0)
    await nav.getByRole('link',{name:'Local recovery',exact:true}).click()
    await page.getByLabel('Open a full backup').setInputFiles(path.pathname)
    await page.getByText('Recovery opened.',{exact:false}).first().waitFor()
    await nav.getByRole('link',{name:'Files',exact:true}).click()
    await page.locator('#file-input').setInputFiles({name:'next.tif',mimeType:'image/tiff',buffer:Buffer.from('a')})
    await page.getByText('The selected files were not added.',{exact:false}).waitFor()
    await nav.getByRole('link',{name:'Local recovery',exact:true}).click()
    await nav.getByRole('link',{name:'Files',exact:true}).click()
    await page.getByRole('button',{name:/Remove listing/}).click()
    await page.getByRole('button',{name:'Retry selected files'}).click()
    await page.getByText('next.tif',{exact:true}).waitFor()
    await page.getByText('These file listings would prevent unfinished vocabulary input from being recovered.',{exact:false}).waitFor({state:'detached'})
    assert.match(await page.locator('main').innerText(), /1 pending assignment/)
    assert.equal(await page.locator('#file-input').evaluate((input:HTMLInputElement) => input.files?.length),0)
    await page.locator('#directory-input').evaluate((input:HTMLInputElement) => {const files = new DataTransfer(); const file = new File(['x'],'image.tif'); Object.defineProperty(file,'webkitRelativePath',{value:'root/' + Array.from({length:18}, () => 'a'.repeat(240)).join('/') + '/image.tif'}); files.items.add(file); input.files = files.files; input.dispatchEvent(new Event('change',{bubbles:true}))})
    await page.getByRole('button',{name:'Retry selected files'}).waitFor()
    await nav.getByRole('link',{name:'Local recovery',exact:true}).click()
    await page.getByLabel('Open a full backup').setInputFiles({name:'replacement.json',mimeType:'application/json',buffer:Buffer.from(encodeRecovery({draft:study.draft,pending:[]}))})
    await page.getByText('Recovery opened.',{exact:false}).first().waitFor()
    await nav.getByRole('link',{name:'Files',exact:true}).click()
    await page.locator('#file-input').waitFor()
    assert.equal(await page.getByRole('button',{name:'Retry selected files'}).count(),0)
  } finally {await browser?.close(); server.kill()}
})
