import {test} from 'node:test'
import assert from 'node:assert/strict'
import {stageFiles, inventoryRows, previewAssignment, applyPreview} from '../src/features/editor/files/inventory.js'
import {clearListingRecoveryNotice, listingRecoveryNotice} from '../src/features/editor/files/selection.js'
import {newEditor, changeStudy} from '../src/features/editor/document.js'
import {applyChange, inspectDraft} from '@bijux/ro-crate-creator'

test('staged duplicate paths remain visible and cannot be assigned atomically', () => {
  let draft = changeStudy(newEditor(), {type:'add-study'})
  const dataset = applyChange(draft, {type:'add-entity', kind:'dataset'}); assert.equal(dataset.status, 'applied'); if (dataset.status !== 'applied') return
  const specimen = applyChange(dataset.draft, {type:'add-entity', kind:'specimen'}); assert.equal(specimen.status, 'applied'); if (specimen.status !== 'applied') return
  draft = specimen.draft
  const pending = stageFiles([], [{path:'images/a.tif', size:'2'}, {path:'images/a.tif', size:'3'}])
  assert.deepEqual(inventoryRows(inspectDraft(draft).files, pending).map(row => row.conflict), [true,true])
  const preview = previewAssignment(draft, pending, new Set(pending.map(row => row.id)), dataset.entityId, specimen.entityId)
  assert.equal(preview.status, 'blocked')
  assert.equal(inspectDraft(draft).files.length, 0)
})

test('assignment preview is atomic and rejects stale drafts or selection', () => {
  let draft = changeStudy(newEditor(), {type:'add-study'})
  const dataset = applyChange(draft, {type:'add-entity', kind:'dataset'}); if (dataset.status !== 'applied') throw Error()
  const specimen = applyChange(dataset.draft, {type:'add-entity', kind:'specimen'}); if (specimen.status !== 'applied') throw Error()
  draft = specimen.draft
  const pending = stageFiles([], [{path:'a.tif', size:'10'}, {path:'b.tif', size:'20'}])
  const selected = new Set(pending.map(row => row.id))
  const preview = previewAssignment(draft, pending, selected, dataset.entityId, specimen.entityId)
  assert.equal(preview.status, 'ready'); if (preview.status !== 'ready') return
  assert.equal(applyPreview(preview, changeStudy(draft, {type:'set-field',entityId:'./',field:'name',value:'changed'}), pending, selected).status, 'stale')
  assert.equal(applyPreview(preview, draft, pending, new Set()).status, 'stale')
  const result = applyPreview(preview, draft, pending, selected)
  assert.equal(result.status, 'applied'); if (result.status !== 'applied') return
  assert.equal(result.pending.length, 0)
  assert.deepEqual(inspectDraft(result.draft).files.map(row => row.path), ['a.tif','b.tif'])
})

test('inventory and selection retain the existing 100,000-row manifest workload', async () => {
  const {makeWorkloadCases} = await import('../../../tests/parity/workload-cases.mjs')
  const base = {'@context':[], '@graph':[{'@id':'./', hasPart:[]}, {'@id':'#ts0',column:[]}]}
  const workload = makeWorkloadCases({files:{'ro-crate-metadata.json':JSON.stringify(base)}})[0]
  const paths = workload.files['file_list.tsv'].trimEnd().split('\n').slice(1).map(line => ({path:line.split('\t')[0],size:'0'}))
  const started = performance.now()
  const staged = stageFiles([], paths)
  const rows = inventoryRows([], staged)
  const selected = new Set(rows.filter(row => row.path.includes('999')).map(row => row.id))
  assert.equal(rows.length,100000)
  assert.equal(new Set(rows.map(row => row.id)).size,100000)
  assert.ok(selected.size > 0)
  assert.equal(rows.some(row => row.conflict),false)
  console.log(`Inventory: ${rows.length} existing workload paths, ${selected.size} selected in ${(performance.now()-started).toFixed(1)} ms`)
})

test('directory listings use crate-relative paths and reject mixed or unsafe selections before staging', async () => {
  const {listingFiles} = await import('../src/features/editor/files/inventory.js')
  const files = [{name:'a.tif', size:3, webkitRelativePath:'images/a.tif'}, {name:'b.tif', size:4, webkitRelativePath:'images/nested/b.tif'}]
  assert.deepEqual(listingFiles(files, 'directory'), [{path:'a.tif',size:'3'}, {path:'nested/b.tif',size:'4'}])
  assert.deepEqual(listingFiles([{name:'plain.tif',size:1,webkitRelativePath:''}], 'files'), [{path:'plain.tif',size:'1'}])
  assert.throws(() => listingFiles([...files, {name:'x',size:1,webkitRelativePath:''}], 'directory'))
  assert.throws(() => listingFiles([...files, {name:'x',size:1,webkitRelativePath:'other/x'}], 'directory'))
  assert.throws(() => listingFiles([{name:'x',size:1,webkitRelativePath:'images/../x'}], 'directory'))
  assert.throws(() => listingFiles(files, 'files'))
  assert.throws(() => listingFiles([{name:'bad\0name',size:1,webkitRelativePath:''}], 'files'))
  assert.throws(() => listingFiles([{name:'bad\ud800',size:1,webkitRelativePath:''}], 'files'))
})

test('staging after a maximum safe pending identifier allocates unused safe identifiers', async () => {
  const {encodeRecovery, decodeRecovery} = await import('../src/drafts/recovery-codec.js')
  const pending = stageFiles([{id:'p:9007199254740991',path:'old.tif',size:'1'}, {id:'p:1',path:'one.tif',size:'1'}], [{path:'new.tif',size:'2'}, {path:'next.tif',size:'3'}])
  assert.deepEqual(pending.map(row => row.id), ['p:9007199254740991','p:1','p:2','p:3'])
  const result = await decodeRecovery(encodeRecovery({draft:newEditor(),pending}))
  assert.equal(result.status,'decoded')
})

test('staging rejects overlong paths and excessive counts atomically', async () => {
  const {RECOVERY_MAX_PENDING, RECOVERY_MAX_PATH_BYTES, encodeRecovery} = await import('../src/drafts/recovery-codec.js')
  const prior = stageFiles([], [{path:'kept.tif',size:'1'}])
  const tooLong = `${'a'.repeat(RECOVERY_MAX_PATH_BYTES + 1)}.tif`
  assert.throws(() => stageFiles(prior, [{path:'valid.tif',size:'1'}, {path:tooLong,size:'1'}]), /4096.*bytes/i)
  assert.throws(() => stageFiles(prior, [{path:'é'.repeat(2049),size:'1'}]), /4096.*bytes/i)
  assert.deepEqual(prior.map(row => row.path), ['kept.tif'])
  const full = Array.from({length:RECOVERY_MAX_PENDING}, (_,index) => ({id:`p:${index + 1}`,path:'duplicate.tif',size:'1'}))
  assert.throws(() => stageFiles(full,[{path:'next.tif',size:'1'}]), /100,000/)
  assert.doesNotThrow(() => encodeRecovery({draft:newEditor(),pending:prior}))
})

test('listing guidance clears only when its own constraint resolves', () => {
  const vocabulary = listingRecoveryNotice(true), provisional = listingRecoveryNotice(false)
  assert.notEqual(vocabulary,provisional)
  assert.match(vocabulary,/vocabulary/); assert.match(provisional,/Unsaved text/)
  assert.deepEqual(clearListingRecoveryNotice([provisional],'provisional-resolved'),[])
  assert.deepEqual(clearListingRecoveryNotice([vocabulary],'provisional-resolved'),[vocabulary])
  assert.deepEqual(clearListingRecoveryNotice([vocabulary],'listing-admitted'),[])
  assert.deepEqual(clearListingRecoveryNotice([provisional],'listing-admitted'),[])
  const unrelated=['Another problem']; assert.equal(clearListingRecoveryNotice(unrelated,'provisional-resolved'),unrelated)
  const multiple=[provisional,'Another problem']; assert.equal(clearListingRecoveryNotice(multiple,'listing-admitted'),multiple)
})
