import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawn, spawnSync} from 'node:child_process'
import {mkdir} from 'node:fs/promises'
import {chromium} from 'playwright'

const base = 'http://127.0.0.1:4330'
test('file listings survive navigation, expose conflicts, and export both metadata files', async () => {
  const server = spawn(process.execPath, ['../../artifacts/web/dist/server/entry.mjs'], {cwd:new URL('..',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:'4330'},stdio:'ignore'})
  let browser
  try {
    for (let i=0;;i++) {try {if ((await fetch(base)).ok) break} catch {} if (i === 100 || server.exitCode !== null) throw Error('Server did not start'); await new Promise(resolve => setTimeout(resolve,100))}
    browser = await chromium.launch({headless:true})
    const page = await browser.newPage({acceptDownloads:true})
    await page.goto(base)
    await page.getByRole('button',{name:'Create study'}).click()
    const nav = (name:string) => page.getByRole('navigation',{name:'Study sections',exact:true}).getByRole('link',{name,exact:true}).click()
    await nav('Specimens'); await page.getByRole('button',{name:'Add specimen'}).click(); await page.getByLabel('Specimen label 1').fill('Sample')
    await nav('Datasets'); await page.getByRole('button',{name:'Add dataset'}).click(); await page.getByLabel('Dataset name 1').fill('Data')
    await nav('Files')
    const start = performance.now()
    await page.locator('#file-input').setInputFiles(Array.from({length:120},(_,i) => ({name:`image-${i}.tif`,mimeType:'image/tiff',buffer:Buffer.from('abc')})))
    assert.equal(await page.locator('tbody tr').count(), 50)
    assert.match(await page.locator('main').innerText(), /120 pending assignment/)
    console.log(`Browser: staged 120 metadata rows and rendered 50 in ${(performance.now()-start).toFixed(1)} ms`)
    await page.locator('#file-input').setInputFiles({name:'image-0.tif',mimeType:'image/tiff',buffer:Buffer.from('x')})
    await page.getByLabel('Filter paths').fill('image-0.tif')
    assert.equal(await page.getByText('Conflicting path').count(),2)
    await nav('Export metadata'); await page.getByRole('button',{name:'Download metadata'}).click(); assert.match(await page.getByRole('alert').innerText(), /pending file listings/); await nav('Files')
    await page.getByLabel('Filter paths').fill('image-0.tif')
    assert.equal(await page.getByText('Conflicting path').count(),2)
    await page.getByRole('button',{name:'Remove listing'}).last().click()
    await page.getByLabel('Select page').check()
    await page.getByLabel('Dataset for selected files').selectOption({label:'Data'})
    await page.getByLabel('Specimen for selected files').selectOption({label:'Sample'})
    await page.getByRole('button',{name:'Preview assignment'}).click()
    await page.getByLabel('Specimen for selected files').selectOption('')
    assert.equal(await page.getByRole('button',{name:'Apply assignment'}).count(),0)
    await page.getByLabel('Specimen for selected files').selectOption({label:'Sample'})
    await page.getByRole('button',{name:'Preview assignment'}).click()
    await page.getByRole('button',{name:'Apply assignment'}).click()
    await page.getByLabel('Filter paths').fill('')
    await page.getByLabel('Select page').check()
    await page.getByRole('button',{name:'Preview assignment'}).click(); await page.getByRole('button',{name:'Apply assignment'}).click()
    await page.getByRole('button',{name:'Next page'}).click(); await page.getByLabel('Select page').check(); await page.getByRole('button',{name:'Preview assignment'}).click(); await page.getByRole('button',{name:'Apply assignment'}).click()
    await page.getByRole('button',{name:'Next page'}).click(); await page.getByLabel('Select page').check(); await page.getByRole('button',{name:'Preview assignment'}).click(); await page.getByRole('button',{name:'Apply assignment'}).click()
    assert.match(await page.locator('main').innerText(), /; 0 pending assignment/)
    await page.setViewportSize({width:390,height:844}); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true)
    await page.setViewportSize({width:1280,height:800}); await nav('Export metadata')
    const wait = page.waitForEvent('download', {timeout:5000}); await page.getByRole('button',{name:'Download metadata ZIP'}).click(); const file = await wait
    assert.equal(file.suggestedFilename(),'ro-crate-metadata.zip')
    const directory = new URL('../../../artifacts/file-journey/', import.meta.url); await mkdir(directory,{recursive:true}); const archive = new URL('metadata.zip',directory).pathname; await file.saveAs(archive)
    const extract = (name:string) => {const result = spawnSync('unzip',['-p',archive,name],{encoding:'utf8'}); assert.equal(result.status,0,result.stderr); return result.stdout}
    const graph = JSON.parse(extract('ro-crate-metadata.json')) as {'@graph':Array<Record<string,unknown>>}
    assert.ok(graph['@graph'].some(node => node['@id'] === 'file_list.tsv'))
    const manifest = extract('file_list.tsv'); assert.match(manifest,/image-0\.tif\t3\t/); assert.equal(manifest.trim().split('\n').length,121)
  } finally {await browser?.close(); server.kill()}
})
