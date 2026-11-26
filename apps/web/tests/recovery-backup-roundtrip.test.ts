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
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {cwd:new URL('..',import.meta.url), env:{...process.env, HOST:'127.0.0.1', PORT:String(port), BSS_MODE:'standalone'}, stdio:'ignore'})
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
