import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {startOwnedServerProcess, stopOwnedServer} from '../support/owned-server.js'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {chromium} from 'playwright'
import {fromDirectory} from '@bijux/ro-crate-core'
import {applyChange, createDraft, importCrate, materializeDraft, type DraftChange} from '@bijux/ro-crate-creator'
import {encodeRecovery} from '../../src/drafts/recovery-codec.js'

test('file listings survive navigation, expose conflicts, and export both metadata files', async t => {
  const {child:server,port} = await startOwnedServerProcess({port:0,env:{...process.env,HOST:'127.0.0.1'}})
  t.after(() => stopOwnedServer(server))
  const base = `http://127.0.0.1:${port}`
  let browser
  try {

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
    const fixture = new URL('../../../../artifacts/file-journey/images/', import.meta.url); await mkdir(new URL('nested/',fixture),{recursive:true}); await writeFile(new URL('a.tif',fixture),'abc'); await writeFile(new URL('nested/b.tif',fixture),'defg')
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
    assert.equal(await page.getByText('This export does not include file_list.tsv.', {exact:false}).count(), 0)
    const wait = page.waitForEvent('download', {timeout:5000}); await page.getByRole('button',{name:'Download metadata ZIP'}).click(); const file = await wait
    assert.equal(file.suggestedFilename(),'ro-crate-metadata.zip')
    const directory = new URL('../../../../artifacts/file-journey/', import.meta.url); await mkdir(directory,{recursive:true}); const archive = new URL('metadata.zip',directory).pathname; await file.saveAs(archive)
    // Inspect exports with a reader independent of the browser ZIP writer.
    const extract = (name:string) => {const result = spawnSync('python3',['-c','import sys, zipfile; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))',archive,name],{encoding:'utf8'}); assert.equal(result.status,0,result.error?.message ?? result.stderr); return result.stdout}
    const graph = JSON.parse(extract('ro-crate-metadata.json')) as {'@graph':Array<Record<string,unknown>>}
    assert.ok(graph['@graph'].some(node => node['@id'] === 'file_list.tsv'))
    const manifest = extract('file_list.tsv'); assert.match(manifest,/image-0\.tif\t3\t/); assert.equal(manifest.trim().split('\n').length,123); assert.ok(manifest.includes(`a.tif\t3\t${datasetId}\t${specimenId}\t`)); assert.ok(manifest.includes(`nested/b.tif\t4\t${datasetId}\t${specimenId}\t`)); assert.deepEqual(manifest.trim().split('\n').slice(1).map(row => row.split('\t')[0]).filter(path => normalizedPaths.includes(path)).sort(), normalizedPaths); assert.equal(manifest.includes('images/nested/b.tif'),false)
  } finally {await browser?.close(); await stopOwnedServer(server)}
})

test('rejected file assignment keeps its selection and preview for retry', async t => {
  let draft=createDraft()
  const step=(change:DraftChange)=>{const r=applyChange(draft,change);if(r.status!=='applied')throw Error('setup');draft=r.draft;return r.entityId}
  step({type:'add-study'}); const biosample=step({type:'add-entity',kind:'biosample'}); const specimen=step({type:'add-entity',kind:'specimen'}); const dataset=step({type:'add-entity',kind:'dataset'}); const secondDataset=step({type:'add-entity',kind:'dataset'})
  step({type:'add-file',file:{path:'image.tif',size:'3',type:'image',specimenId:specimen,datasetId:dataset}})
  const materialized=materializeDraft(draft);if(materialized.status!=='materialized') throw Error('export')
  const metadata=JSON.parse(materialized.files.get('ro-crate-metadata.json') as string) as {'@graph':Array<Record<string,unknown>>}
  const root=metadata['@graph'].find(node=>node['@id']==='./'), target=metadata['@graph'].find(node=>node['@id']===secondDataset)
  if(!root || !target)throw Error('Fixture entities missing')
  root.description='x'.repeat(8*1024*1024)
  const longDataset='#'+'x'.repeat(500); target['@id']=longDataset
  const imported=await importCrate(new Map([['ro-crate-metadata.json',JSON.stringify(metadata)],['file_list.tsv',materialized.files.get('file_list.tsv') as string]]),{metadataPaths:['ro-crate-metadata.json','file_list.tsv']});if(imported.status!=='editable') throw Error(JSON.stringify(imported))
  const pending:[]=[], pendingTerms=[{kind:'taxonomy' as const,entityId:biosample,previousId:null,identifier:'',label:'Unfinished organism'}]
  const edit=applyChange(imported.draft,{type:'set-field',entityId:'./',field:'description',value:'a'.repeat(16*1024*1024)});if(edit.status!=='applied')throw Error('edit')
  const out=materializeDraft(edit.draft); if(out.status!=='materialized')throw Error('materialize')
  const size=[...out.files.values()].reduce((sum,value)=>sum+(typeof value==='string'?new TextEncoder().encode(value).length:value instanceof Uint8Array?value.length:0),0)

  const adjusted=applyChange(imported.draft,{type:'set-field',entityId:'./',field:'description',value:'a'.repeat(16*1024*1024-(size-16*1024*1024)-200)})
  if(adjusted.status!=='applied')throw Error('fixture')
  const backup=encodeRecovery({draft:adjusted.draft,pending,pendingTerms})
  const candidate=applyChange(adjusted.draft,{type:'update-file',file:{path:'image.tif',size:'3',type:'image',specimenId:specimen,datasetId:longDataset}})
  if(candidate.status!=='applied')throw Error('assignment fixture')
  assert.throws(()=>encodeRecovery({draft:candidate.draft,pending,pendingTerms}),/size limit/)
  const {child:server,port} = await startOwnedServerProcess({port:0,env:{...process.env,HOST:'127.0.0.1'}})
  t.after(() => stopOwnedServer(server))
  const base = `http://127.0.0.1:${port}`
  let browser
  try {

   browser=await chromium.launch({headless:true}); const page=await browser.newPage({acceptDownloads:true});page.setDefaultTimeout(30000);page.on('dialog',dialog=>void dialog.accept())
   await page.goto(base)
   const nav=(name:string)=>page.getByRole('navigation',{name:'Study sections',exact:true}).getByRole('link',{name,exact:true}).click()
   await nav('Local recovery');await page.getByLabel('Open a full backup').setInputFiles({name:'near-limit.json',mimeType:'application/json',buffer:Buffer.from(backup)})
   await page.getByText('Recovery opened.',{exact:false}).first().waitFor()
   await nav('Files');await page.getByLabel('Select page').check();await page.getByLabel('Dataset for selected files').selectOption(longDataset);await page.getByLabel('Specimen for selected files').selectOption(specimen)
   await page.getByRole('button',{name:'Preview assignment'}).click();await page.getByRole('button',{name:'Apply assignment'}).click()
   await page.getByText('This change would prevent the draft from being recovered.',{exact:false}).waitFor()
   assert.equal(await page.getByLabel('Select page').isChecked(),true);assert.equal(await page.getByRole('button',{name:'Apply assignment'}).count(),1)
   await nav('Local recovery');const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download editable backup'}).click();const copy=await downloading
   const copyPath=await copy.path();if(!copyPath)throw Error('Backup download unavailable')
   const recovered=JSON.parse(await readFile(copyPath,'utf8')) as {creator:{snapshot:{files:Array<{path:string;datasetId:string}>}};pendingTerms:Array<{label:string}>}
   assert.equal(recovered.creator.snapshot.files.find(file=>file.path==='image.tif')?.datasetId,dataset);assert.equal(recovered.pendingTerms[0]?.label,'Unfinished organism')
   await nav('Files');await page.getByLabel('Select page').check();await page.getByLabel('Dataset for selected files').selectOption(longDataset);await page.getByLabel('Specimen for selected files').selectOption(specimen);await page.getByRole('button',{name:'Preview assignment'}).click()
   await page.getByText('1 unfinished vocabulary entry.',{exact:false}).waitFor();await page.getByRole('button',{name:'Discard all unfinished vocabulary input'}).click()
   await page.getByRole('button',{name:'Apply assignment'}).click();assert.equal(await page.getByLabel('Select page').isChecked(),false);assert.equal(await page.getByRole('button',{name:'Apply assignment'}).count(),0)
   assert.equal(await page.getByText('This change would prevent the draft from being recovered.',{exact:false}).count(),0)
   await nav('Local recovery');await page.getByLabel('Open a full backup').setInputFiles({name:'near-limit.json',mimeType:'application/json',buffer:Buffer.from(backup)});await page.getByText('Recovery opened.',{exact:false}).first().waitFor()
   await nav('Files');await page.getByLabel('Select page').check();await page.getByLabel('Dataset for selected files').selectOption(longDataset);await page.getByLabel('Specimen for selected files').selectOption(specimen)
   await page.getByRole('button',{name:'Preview assignment'}).click();await page.getByRole('button',{name:'Apply assignment'}).click();await page.getByText('This change would prevent the draft from being recovered.',{exact:false}).waitFor()
   await nav('Export metadata');await page.getByRole('button',{name:'Download metadata'}).click();await page.getByText('Apply or discard unfinished vocabulary input before export.',{exact:false}).waitFor()
   await nav('Files');await page.getByLabel('Select page').check();await page.getByLabel('Dataset for selected files').selectOption(longDataset);await page.getByLabel('Specimen for selected files').selectOption(specimen);await page.getByRole('button',{name:'Preview assignment'}).click()
   await page.getByRole('button',{name:'Discard all unfinished vocabulary input'}).click();await page.getByRole('button',{name:'Apply assignment'}).click()
   await page.getByText('Apply or discard unfinished vocabulary input before export.',{exact:false}).waitFor()
   await nav('Export metadata');const exporting=page.waitForEvent('download');await page.getByRole('button',{name:'Download metadata ZIP'}).click();const archive=await exporting;const archivePath=await archive.path();if(!archivePath)throw Error('Export unavailable')
   const extracted=spawnSync('python3',['-c','import sys, zipfile; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read("file_list.tsv"))',archivePath],{encoding:'utf8'});assert.equal(extracted.status,0,extracted.stderr);assert.ok(extracted.stdout.includes(longDataset))
  } finally {await browser?.close();await stopOwnedServer(server)}

})

test('oversized listing paths are rejected without losing the existing selection or recovery', async t => {
  const {child:server,port} = await startOwnedServerProcess({port:0,env:{...process.env,HOST:'127.0.0.1'}})
  t.after(() => stopOwnedServer(server))
  const base = `http://127.0.0.1:${port}`
  let browser
  try {

    browser = await chromium.launch({headless:true})
    const page = await browser.newPage({acceptDownloads:true})
    await page.goto(base)
    await page.getByRole('button',{name:'Create study'}).click()
    await page.getByRole('navigation',{name:'Study sections',exact:true}).getByRole('link',{name:'Files',exact:true}).click()
    await page.locator('#file-input').setInputFiles({name:'kept.tif',mimeType:'image/tiff',buffer:Buffer.from('a')})
    await page.getByLabel('Select kept.tif p:1').check()
    await page.locator('#directory-input').evaluate((input:HTMLInputElement) => {
      const data = new DataTransfer()
      const file = new File(['x'], 'image.tif')
      Object.defineProperty(file, 'webkitRelativePath', {value:'root/' + Array.from({length:18}, (_, index) => `${String(index).padStart(2,'0')}${'a'.repeat(238)}`).join('/') + '/image.tif'})
      data.items.add(file); input.files = data.files; input.dispatchEvent(new Event('change',{bubbles:true}))
    })
    assert.match(await page.getByRole('alert').innerText(), /4096 UTF-8 bytes/)
    assert.equal(await page.getByLabel('Select kept.tif p:1').isChecked(),true)
    assert.match(await page.locator('main').innerText(), /1 pending assignment/)
    assert.equal(await page.locator('#directory-input').evaluate((input:HTMLInputElement) => input.files?.length),1)
    await page.getByRole('navigation',{name:'Study sections',exact:true}).getByRole('link',{name:'Local recovery',exact:true}).click()
    const download = page.waitForEvent('download')
    await page.getByRole('button',{name:'Download editable backup',exact:true}).click()
    const backup = await download
    assert.equal(backup.suggestedFilename(),'study-backup.json')
    const stream = await backup.createReadStream()
    const chunks:Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    const decoded = JSON.parse(Buffer.concat(chunks).toString()) as {pending:Array<{path:string}>}
    assert.deepEqual(decoded.pending.map(row => row.path), ['kept.tif'])
  } finally {await browser?.close(); await stopOwnedServer(server)}
})

test('file journey server readiness belongs to its spawned process', async t => {
  const {createServer} = await import('node:http')
  let foreignRequests = 0
  const foreign = createServer((_request,response) => {foreignRequests++; response.end('unrelated')})
  await new Promise<void>((resolve,reject) => {foreign.once('error',reject); foreign.listen(0,'127.0.0.1',resolve)})
  t.after(() => new Promise<void>((resolve,reject) => {foreign.closeAllConnections(); foreign.close(error => error ? reject(error) : resolve())}))
  const address = foreign.address(); assert.ok(address && typeof address !== 'string')
  const {child,port} = await startOwnedServerProcess({port:0,env:{...process.env,HOST:'127.0.0.1'}})
  t.after(() => stopOwnedServer(child))
  assert.notEqual(port,address.port)
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status,200)
  assert.equal(foreignRequests,0)
})
