import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawn, spawnSync} from 'node:child_process'
import {mkdir, writeFile} from 'node:fs/promises'
import {chromium} from 'playwright'
import {fromDirectory} from '@bijux/ro-crate-core'

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
    await nav('Specimens'); await page.getByRole('button',{name:'Add specimen'}).click(); await page.getByLabel('Specimen label 1').fill('Sample'); await page.getByRole('button',{name:'Add specimen'}).click(); await page.getByLabel('Specimen label 2').fill('Sample')
    const firstSpecimenId = (await page.getByRole('group',{name:'Specimen 1',exact:true}).getAttribute('id'))!.replace('scientific-record-','')
    const specimenId = (await page.getByRole('group',{name:'Specimen 2',exact:true}).getAttribute('id'))!.replace('scientific-record-','')
    await nav('Datasets'); await page.getByRole('button',{name:'Add dataset'}).click(); await page.getByLabel('Dataset name 1').fill('Data'); await page.getByRole('button',{name:'Add dataset'}).click(); await page.getByLabel('Dataset name 2').fill('Data')
    const firstDatasetId = (await page.getByRole('group',{name:'Dataset 1',exact:true}).getAttribute('id'))!.replace('scientific-record-','')
    const datasetId = (await page.getByRole('group',{name:'Dataset 2',exact:true}).getAttribute('id'))!.replace('scientific-record-','')
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
    const removes = page.getByRole('button',{name:/Remove listing image-0\.tif/}); assert.equal(await removes.count(),2); assert.notEqual(await removes.nth(0).getAttribute('aria-label'),await removes.nth(1).getAttribute('aria-label')); await removes.last().click()
    await page.getByLabel('Select page').check()
    for (const id of [firstDatasetId,datasetId]) assert.equal(await page.getByRole('option',{name:`Data (${id})`}).count(),1)
    for (const id of [firstSpecimenId,specimenId]) assert.equal(await page.getByRole('option',{name:`Sample (${id})`}).count(),1)
    await page.getByLabel('Dataset for selected files').selectOption(datasetId)
    await page.getByLabel('Specimen for selected files').selectOption(specimenId)
    await page.getByRole('button',{name:'Preview assignment'}).click()
    assert.ok((await page.getByRole('status').last().innerText()).includes(`dataset Data (${datasetId}) and specimen Sample (${specimenId})`))
    await page.getByLabel('Specimen for selected files').selectOption('')
    assert.equal(await page.getByRole('button',{name:'Apply assignment'}).count(),0)
    await page.getByLabel('Specimen for selected files').selectOption(specimenId)
    await page.getByRole('button',{name:'Preview assignment'}).click()
    await page.getByRole('button',{name:'Apply assignment'}).click()
    await page.getByLabel('Filter paths').fill('')
    await page.getByLabel('Select page').check()
    await page.getByRole('button',{name:'Preview assignment'}).click(); await page.getByRole('button',{name:'Apply assignment'}).click()
    await page.getByRole('button',{name:'Next page'}).click(); await page.getByLabel('Select page').check(); await page.getByRole('button',{name:'Preview assignment'}).click(); await page.getByRole('button',{name:'Apply assignment'}).click()
    await page.getByRole('button',{name:'Next page'}).click(); await page.getByLabel('Select page').check(); await page.getByRole('button',{name:'Preview assignment'}).click(); await page.getByRole('button',{name:'Apply assignment'}).click()
    assert.match(await page.locator('main').innerText(), /; 0 pending assignment/)
    const fixture = new URL('../../../artifacts/file-journey/images/', import.meta.url); await mkdir(new URL('nested/',fixture),{recursive:true}); await writeFile(new URL('a.tif',fixture),'abc'); await writeFile(new URL('nested/b.tif',fixture),'defg')
    await page.evaluate(() => {const input = document.createElement('input'); input.type = 'file'; input.id = 'comparison-directory'; input.setAttribute('webkitdirectory',''); document.body.append(input)})
    await page.locator('#comparison-directory').setInputFiles(fixture.pathname)
    const selectedPaths = await page.locator('#comparison-directory').evaluate((input:HTMLInputElement) => Array.from(input.files ?? [], file => ({webkitRelativePath:file.webkitRelativePath})))
    const normalizedPaths = [...fromDirectory(selectedPaths).keys()].sort()
    await page.locator('#directory-input').setInputFiles(fixture.pathname)
    await page.getByLabel('Filter paths').fill('nested/b.tif'); assert.equal(await page.getByText('nested/b.tif',{exact:true}).count(),1)
    await page.getByLabel('Filter paths').fill('a.tif'); await page.getByLabel('Select page').check(); await page.getByLabel('Filter paths').fill('nested/b.tif'); await page.getByLabel('Select page').check()
    await page.getByRole('button',{name:'Preview assignment'}).click(); await page.getByRole('button',{name:'Apply assignment'}).click()
    await page.setViewportSize({width:390,height:844}); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true)
    await page.setViewportSize({width:1280,height:800}); await nav('Export metadata')
    const wait = page.waitForEvent('download', {timeout:5000}); await page.getByRole('button',{name:'Download metadata ZIP'}).click(); const file = await wait
    assert.equal(file.suggestedFilename(),'ro-crate-metadata.zip')
    const directory = new URL('../../../artifacts/file-journey/', import.meta.url); await mkdir(directory,{recursive:true}); const archive = new URL('metadata.zip',directory).pathname; await file.saveAs(archive)
    // Inspect exports with a reader independent of the browser ZIP writer.
    const extract = (name:string) => {const result = spawnSync('python3',['-c','import sys, zipfile; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))',archive,name],{encoding:'utf8'}); assert.equal(result.status,0,result.error?.message ?? result.stderr); return result.stdout}
    const graph = JSON.parse(extract('ro-crate-metadata.json')) as {'@graph':Array<Record<string,unknown>>}
    assert.ok(graph['@graph'].some(node => node['@id'] === 'file_list.tsv'))
    const manifest = extract('file_list.tsv'); assert.match(manifest,/image-0\.tif\t3\t/); assert.equal(manifest.trim().split('\n').length,123); assert.ok(manifest.includes(`a.tif\t3\t${datasetId}\t${specimenId}\t`)); assert.ok(manifest.includes(`nested/b.tif\t4\t${datasetId}\t${specimenId}\t`)); assert.deepEqual(manifest.trim().split('\n').slice(1).map(row => row.split('\t')[0]).filter(path => normalizedPaths.includes(path)).sort(), normalizedPaths); assert.equal(manifest.includes('images/nested/b.tif'),false)
  } finally {await browser?.close(); server.kill()}
})
