import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createServer} from 'node:net'
import test from 'node:test'
import {chromium, type Page} from 'playwright'

test('incomplete and read-only backups reopen in a separate browser context', async () => {
  const reservation = createServer()
  await new Promise<void>(resolve => reservation.listen(0,'127.0.0.1',resolve))
  const address = reservation.address(); if (!address || typeof address === 'string') throw Error('Invalid local port')
  const port = address.port
  await new Promise<void>(resolve => reservation.close(() => resolve()))
  const base = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {cwd:new URL('../..',import.meta.url), env:{...process.env, HOST:'127.0.0.1', PORT:String(port), BSS_MODE:'standalone'}, stdio:'ignore'})
  let browser
  try {
    for (let attempt = 0; ; attempt++) {
      if (server.exitCode !== null) throw Error('Built app did not start')
      try {if ((await fetch(base)).ok && server.exitCode === null) break} catch {}
      if (attempt === 100 || server.exitCode !== null) throw Error('Built app did not start')
      await new Promise(resolve => setTimeout(resolve,100))
    }
    browser = await chromium.launch({headless:true})
    const context = await browser.newContext({acceptDownloads:true}), page = await context.newPage()
    page.on('dialog', dialog => dialog.accept())
    const nav = (target:Page, name:string) => target.locator('aside[aria-label="Study navigation"]').getByRole('link',{name,exact:true}).click()
    const download = async (target:Page, name:string) => {
      const [file] = await Promise.all([target.waitForEvent('download'),target.getByRole('button',{name,exact:true}).click()])
      const chunks:Buffer[] = []
      for await (const chunk of await file.createReadStream()) chunks.push(Buffer.from(chunk))
      return Buffer.concat(chunks)
    }
    await page.goto(base); await page.getByRole('button',{name:'Create study'}).click()
    await page.getByLabel('Study title').fill('Incomplete study')
    await nav(page,'Files'); await page.getByLabel('List files',{exact:true}).setInputFiles({name:'image.tif',mimeType:'image/tiff',buffer:Buffer.from('image')})
    await page.getByText('1 pending assignment.',{exact:false}).waitFor()
    await nav(page,'Local recovery')
    const incomplete = await download(page,'Download editable backup')
    await page.getByLabel('Import metadata files').setInputFiles({name:'ro-crate-metadata.json',mimeType:'application/json',buffer:Buffer.from('{"@context":"https://example.com/unsupported","@graph":[]}')})
    await page.getByText('This backup is read-only:',{exact:false}).waitFor()
    await page.evaluate(() => {
      ;(window as unknown as {originalCreateObjectURL:typeof URL.createObjectURL}).originalCreateObjectURL = URL.createObjectURL
      URL.createObjectURL = () => {throw Error('Download unavailable')}
    })
    await page.getByRole('button',{name:'Download read-only backup'}).click()
    await page.getByText('Read-only backup could not be created:',{exact:false}).waitFor()
    await page.getByText('This backup is read-only:',{exact:false}).waitFor()
    await page.evaluate(() => {URL.createObjectURL = (window as unknown as {originalCreateObjectURL:typeof URL.createObjectURL}).originalCreateObjectURL})
    const readonly = await download(page,'Download read-only backup')
    const separate = await browser.newContext({acceptDownloads:true}), opened = await separate.newPage()
    opened.on('dialog', dialog => dialog.accept()); await opened.goto(base)
    await nav(opened,'Local recovery')
    await opened.getByLabel('Open a full backup').setInputFiles({name:'study-backup.json',mimeType:'application/json',buffer:incomplete})
    await opened.getByText('Recovery opened.',{exact:false}).first().waitFor()
    await nav(opened,'Files'); await opened.getByText('1 pending assignment.',{exact:false}).waitFor()
    await nav(opened,'Study details'); assert.equal(await opened.getByLabel('Study title').inputValue(),'Incomplete study')
    await nav(opened,'Local recovery')
    await opened.getByLabel('Open a full backup').setInputFiles({name:'read-only-backup.json',mimeType:'application/json',buffer:readonly})
    await opened.getByText('This backup is read-only:',{exact:false}).waitFor()
    assert.deepEqual(await download(opened,'Download read-only backup'),readonly)
    await nav(opened,'Study details'); assert.equal(await opened.getByLabel('Study title').inputValue(),'Incomplete study')
    await separate.close(); await context.close()
  } finally {await browser?.close(); if (server.exitCode === null) {server.kill(); await new Promise<void>(resolve => server.once('exit',() => resolve()))}}
})

test('inspecting read-only recovery leaves selected files and validation intact', async () => {
  const reservation = createServer()
  await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const address = reservation.address(); if (!address || typeof address === 'string') throw Error('Invalid local port')
  const port = address.port
  await new Promise<void>(resolve => reservation.close(() => resolve()))
  const base = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {cwd:new URL('..', import.meta.url), env:{...process.env, HOST:'127.0.0.1', PORT:String(port), BSS_MODE:'standalone', BIJUX_LOCAL_REFERENCE:'0'}, stdio:'ignore'})
  let browser
  try {
    for (let attempt = 0;; attempt++) {
      if (server.exitCode !== null) throw Error('Built app did not start')
      try {if ((await fetch(base)).ok && server.exitCode === null) break} catch {}
      if (attempt === 100) throw Error('Built app did not start')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    browser = await chromium.launch({headless:true})
    const page = await browser.newPage({acceptDownloads:true})
    page.setDefaultTimeout(5000)
    await page.goto(base)
    await page.getByRole('button', {name:'Create study'}).click()
    const nav = (name:string) => page.getByRole('navigation', {name:'Study sections', exact:true}).getByRole('link', {name, exact:true}).click()
    await nav('Specimens'); await page.getByRole('button', {name:'Add specimen'}).click(); await page.getByLabel('Specimen label 1').fill('Sample')
    await nav('Datasets'); await page.getByRole('button', {name:'Add dataset'}).click(); await page.getByLabel('Dataset name 1').fill('Data')
    await nav('Files')
    await page.getByLabel('List files', {exact:true}).setInputFiles({name:'image.tif', mimeType:'image/tiff', buffer:Buffer.from('image')})
    await page.getByLabel('Select page').check()
    await page.getByLabel('Dataset for selected files').selectOption({index:1})
    await page.getByLabel('Specimen for selected files').selectOption({index:1})
    await page.getByRole('button', {name:'Preview assignment'}).click()
    await page.getByRole('button', {name:'Apply assignment'}).click()
    await nav('Validate crate')
    await page.getByLabel('Payload files').setInputFiles({name:'image.tif', mimeType:'image/tiff', buffer:Buffer.from('image')})
    await page.getByText('All listed payload names are in the current selection.', {exact:false}).waitFor()
    await nav('Study details')
    const live = page.getByRole('region', {name:'Live validation'})
    await live.getByText(/Validation: invalid/).waitFor()
    const before = await live.innerText()
    await nav('Local recovery')
    await page.getByLabel('Import metadata files').setInputFiles({name:'ro-crate-metadata.json', mimeType:'application/json', buffer:Buffer.from('{"@context":"https://example.com/unsupported","@graph":[]}')})
    await page.getByText('This backup is read-only:', {exact:false}).waitFor()
    assert.equal(await live.innerText(), before)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name:'Download read-only backup'}).click()])
    const chunks:Buffer[] = []; for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
    await page.getByLabel('Open a full backup').setInputFiles({name:'read-only.json', mimeType:'application/json', buffer:Buffer.concat(chunks)})
    await page.getByText('This backup is read-only:', {exact:false}).waitFor()
    assert.equal(await live.innerText(), before)
    await nav('Validate crate')
    await page.getByText('All listed payload names are in the current selection.', {exact:false}).waitFor()
  } finally {await browser?.close(); if (server.exitCode === null) {server.kill(); await new Promise<void>(resolve => server.once('exit', () => resolve()))}}
})

test('deleting the current recovery copy allows later edits to be saved', async () => {
  const reservation = createServer()
  await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const address = reservation.address(); if (!address || typeof address === 'string') throw Error('Invalid local port')
  const port = address.port
  await new Promise<void>(resolve => reservation.close(() => resolve()))
  const base = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {cwd:new URL('..', import.meta.url), env:{...process.env, HOST:'127.0.0.1', PORT:String(port), BSS_MODE:'standalone', BIJUX_LOCAL_REFERENCE:'0'}, stdio:'ignore'})
  let browser
  try {
    for (let attempt = 0;; attempt++) {
      if (server.exitCode !== null) throw Error('Built app did not start')
      try {if ((await fetch(base)).ok && server.exitCode === null) break} catch {}
      if (attempt === 100) throw Error('Built app did not start')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    browser = await chromium.launch({headless:true})
    const context = await browser.newContext()
    const page = await context.newPage()
    let confirmations = 0
    page.on('dialog', dialog => {confirmations++; void dialog.accept()})
    await page.goto(base)
    await page.getByRole('button', {name:'Create study'}).click()
    await page.getByLabel('Study title').fill('Before deletion')
    await page.getByText('Recovery copy saved in this browser.', {exact:false}).first().waitFor()
    const nav = (name:string) => page.getByRole('navigation', {name:'Study sections', exact:true}).getByRole('link', {name, exact:true}).click()
    await nav('Local recovery')
    await page.waitForFunction(() => document.querySelectorAll('#recovery-copy option').length > 1)
    const ownId = await page.locator('#recovery-copy option').nth(1).getAttribute('value')
    assert.ok(ownId)
    const other = await page.context().newPage()
    await other.goto(base)
    await other.getByRole('button', {name:'Create study'}).click()
    await other.getByLabel('Study title').fill('Other browser tab')
    await other.getByText('Recovery copy saved in this browser.', {exact:false}).first().waitFor()
    await other.close()
    await nav('Study details'); await nav('Local recovery')
    await page.waitForFunction(() => document.querySelectorAll('#recovery-copy option').length > 2)
    const otherId = await page.locator('#recovery-copy option').evaluateAll((options, own) => options.map(option => (option as HTMLOptionElement).value).find(value => value && value !== own), ownId)
    assert.ok(otherId)
    await page.getByLabel('Available recovery copy').selectOption(otherId)
    await page.getByRole('button', {name:'Delete selected copy'}).click()
    await page.getByText('Recovery copy deleted.', {exact:true}).first().waitFor()
    await page.getByText('Recovery copy saved in this browser.', {exact:false}).first().waitFor()
    confirmations = 0
    await page.getByLabel('Available recovery copy').selectOption(ownId)
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.delete
      const control = {started:false, release:false}
      ;(window as unknown as {deleteControl:typeof control; restoreDelete:() => void}).deleteControl = control
      ;(window as unknown as {restoreDelete:() => void}).restoreDelete = () => {IDBObjectStore.prototype.delete = original}
      IDBObjectStore.prototype.delete = function (key) {
        const request = original.call(this, key)
        const store = this
        let pending = store.count()
        pending.onsuccess = () => {
          if (control.release) store.transaction.abort()
          else {const next = store.count(); next.onsuccess = pending.onsuccess; pending = next}
        }
        control.started = true
        return request
      }
    })
    await page.getByRole('button', {name:'Delete selected copy'}).click()
    await page.waitForFunction(() => (window as unknown as {deleteControl:{started:boolean}}).deleteControl.started, undefined, {timeout:5000})
    const deleteButton = page.getByRole('button', {name:'Delete selected copy'})
    assert.equal(await deleteButton.isDisabled(), true)
    await deleteButton.dispatchEvent('click')
    assert.equal(confirmations, 1)
    await nav('Study details')
    await page.getByLabel('Study title').fill('After failed deletion')
    await page.evaluate(() => {(window as unknown as {deleteControl:{release:boolean}}).deleteControl.release = true})
    await page.getByText('Recovery copy saved in this browser.', {exact:false}).first().waitFor({timeout:5000})
    await nav('Local recovery')
    await page.getByText('Recovery copy could not be deleted:', {exact:false}).first().waitFor({timeout:5000})
    await page.evaluate(() => (window as unknown as {restoreDelete:() => void}).restoreDelete())
    await page.getByLabel('Available recovery copy').selectOption({index:1})
    await page.getByRole('button', {name:'Delete selected copy'}).click()
    await page.getByText('Recovery copy deleted.', {exact:true}).first().waitFor()
    await page.getByText('The current work has no browser recovery copy.', {exact:false}).first().waitFor()
    await nav('Study details')
    await page.getByLabel('Study title').fill('After deletion')
    await page.getByText('Recovery copy saved in this browser.', {exact:false}).first().waitFor({timeout:5000})
    await nav('Local recovery')
    await page.waitForFunction(() => document.querySelectorAll('#recovery-copy option').length > 1)
    const records = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve,reject) => {const request = indexedDB.open('bijux-draft-recovery'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)})
      const result = await new Promise<Array<{backup:string}>>((resolve,reject) => {const request = db.transaction('drafts').objectStore('drafts').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)})
      db.close(); return result
    })
    assert.equal(records.length, 1)
    assert.match(records[0].backup, /After deletion/)
  } finally {await browser?.close(); if (server.exitCode === null) {server.kill(); await new Promise<void>(resolve => server.once('exit', () => resolve()))}}
})
