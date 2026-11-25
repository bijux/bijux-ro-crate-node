import {test} from 'node:test'
import assert from 'node:assert/strict'
import {stageFiles, inventoryRows, previewAssignment, applyPreview} from '../src/features/editor/files/inventory.js'
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
