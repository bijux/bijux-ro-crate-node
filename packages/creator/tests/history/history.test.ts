import assert from 'node:assert/strict'
import {test} from 'node:test'
import * as creator from '../../src/index.js'

test('bulk edits are atomic and history advances revisions while retaining allocated identities', async () => {
  let history = creator.createHistory(creator.createDraft(), {limit: 2})
  const apply = (changes: readonly creator.DraftChange[]) => {
    const result = creator.applyHistoryChanges(history, changes)
    if (result.status !== 'applied') throw Error(JSON.stringify(result))
    history = result.history
    return result.entityIds
  }
  apply([{type: 'add-study'}, {type: 'add-entity', kind: 'biosample'}])
  const first = creator.inspectHistory(history)
  const id = first.draft && creator.inspectDraft(first.draft).entities[0].id
  apply([{type: 'set-field', entityId: id, field: 'name', value: 'first'}])
  const before = creator.inspectHistory(history)
  const failed = creator.applyHistoryChanges(history, [{type: 'set-field', entityId: id, field: 'name', value: 'lost'}, {type: 'delete-entity', entityId: '#missing'}])
  assert.equal(failed.status, 'rejected')
  assert.deepEqual(creator.inspectHistory(history), before)
  const undone = creator.undo(history)
  if (undone.status !== 'applied') throw Error('undo failed')
  history = undone.history
  assert.equal(creator.inspectDraft(creator.inspectHistory(history).draft).entities[0].name, undefined)
  assert.ok(creator.inspectDraft(creator.inspectHistory(history).draft).revision > creator.inspectDraft(before.draft).revision)
  const redone = creator.redo(history)
  if (redone.status !== 'applied') throw Error('redo failed')
  assert.equal(creator.inspectDraft(creator.inspectHistory(redone.history).draft).entities[0].name, 'first')
  const again = creator.undo(redone.history)
  if (again.status !== 'applied') throw Error('second undo failed')
  history = again.history
  apply([{type: 'add-entity', kind: 'dataset'}])
  assert.equal(creator.redo(history).status, 'rejected')
  assert.notEqual(creator.inspectDraft(creator.inspectHistory(history).draft).entities[1].id, id)
  const backup = await creator.decodeDraft(creator.encodeDraft(creator.inspectHistory(history).draft))
  assert.equal(backup.status, 'decoded')
})

test('undoing creation keeps allocated ids reserved and empty snapshots can be backed up', async () => {
  let history = creator.createHistory(creator.createDraft(), {limit: 3})
  let result = creator.applyHistoryChanges(history, [{type:'add-study'}, {type:'add-entity', kind:'biosample'}])
  if (result.status !== 'applied') throw Error('create failed')
  history = result.history
  const old = creator.inspectDraft(creator.inspectHistory(history).draft).entities[0].id
  const undo = creator.undo(history)
  if (undo.status !== 'applied') throw Error('undo failed')
  history = undo.history
  const encoded = creator.encodeDraft(creator.inspectHistory(history).draft)
  assert.equal((await creator.decodeDraft(encoded)).status, 'decoded')
  const invalid = JSON.parse(encoded) as {revision: number; nextId: number}
  invalid.revision = invalid.nextId
  assert.equal((await creator.decodeDraft(JSON.stringify(invalid))).status, 'rejected')
  result = creator.applyHistoryChanges(history, [{type:'add-study'}, {type:'add-entity', kind:'biosample'}])
  if (result.status !== 'applied') throw Error('branch failed')
  assert.notEqual(creator.inspectDraft(creator.inspectHistory(result.history).draft).entities[0].id, old)
})

test('a file batch can atomically replace a referenced source image', () => {
  let draft = creator.createDraft()
  const step = (change: creator.DraftChange) => {const result = creator.applyChange(draft, change); if (result.status !== 'applied') throw Error('setup'); draft = result.draft; return result.entityId}
  step({type:'add-study'})
  const datasetId = step({type:'add-entity', kind:'dataset'})
  const specimenId = step({type:'add-entity', kind:'specimen'})
  const image = {path:'image.tif', size:'1', datasetId, specimenId, type:'image' as const}
  const annotation = {path:'mask.tif', size:'1', datasetId, specimenId, type:'annotation' as const, sourceImage:'image.tif'}
  step({type:'add-file', file:image})
  step({type:'add-file', file:annotation})
  const result = creator.applyChanges(draft, [{type:'delete-file', path:'image.tif'}, {type:'add-file', file:{...image, path:'new.tif'}}, {type:'update-file', file:{...annotation, sourceImage:'new.tif'}}])
  assert.equal(result.status, 'applied')
  if (result.status !== 'applied') return
  assert.equal(creator.inspectDraft(result.draft).files.find(file => file.path === 'mask.tif')?.sourceImage, 'new.tif')
  assert.equal(creator.inspectDraft(draft).files[0].path, 'image.tif')
})

test('history bounds retained undo states and rejects empty batches without clearing redo', () => {
  assert.throws(() => creator.createHistory(creator.createDraft(), {limit:0}), RangeError)
  assert.throws(() => creator.createHistory(creator.createDraft(), {limit:101}), RangeError)
  let history = creator.createHistory(creator.createDraft(), {limit:1})
  for (const changes of [[{type:'add-study'}], [{type:'set-field', entityId:'./', field:'name', value:'x'}]] as creator.DraftChange[][]) {
    const result = creator.applyHistoryChanges(history, changes)
    if (result.status !== 'applied') throw Error('edit failed')
    history = result.history
  }
  assert.equal(creator.inspectHistory(history).undoCount, 1)
  const undone = creator.undo(history)
  if (undone.status !== 'applied') throw Error('undo failed')
  assert.equal(creator.undo(undone.history).status, 'rejected')
  assert.equal(creator.applyHistoryChanges(undone.history, []).status, 'rejected')
  assert.equal(creator.redo(undone.history).status, 'applied')
})

test('imported source and reserved ids survive undo, branching and backup', async () => {
  const metadata = '{"@context":["https://w3id.org/ro/crate/1.1/context",{"bia":"http://bia/"}],"@graph":[{"@id":"ro-crate-metadata.json","@type":"CreativeWork","conformsTo":{"@id":"https://w3id.org/ro/crate/1.1"},"about":{"@id":"./"}},{"@id":"./","@type":["Dataset","bia:Study"],"name":"Original","unknown":{"@id":"#entity-1"}},{"@id":"#entity-1","@type":"bia:Unknown","value":"kept"}]}'
  const imported = await creator.importCrate(new Map([['ro-crate-metadata.json', metadata], ['notes.txt', 'original']]), {metadataPaths:['ro-crate-metadata.json', 'notes.txt']})
  if (imported.status !== 'editable') throw Error('import failed')
  let history = creator.createHistory(imported.draft)
  const edited = creator.applyHistoryChanges(history, [{type:'set-field', entityId:'./', field:'name', value:'edited'}, {type:'add-entity', kind:'biosample'}])
  if (edited.status !== 'applied') throw Error('edit failed')
  const minted = edited.entityIds[1]
  assert.notEqual(minted, '#entity-1')
  const undo = creator.undo(edited.history)
  if (undo.status !== 'applied') throw Error('undo failed')
  history = undo.history
  const next = creator.applyHistoryChanges(history, [{type:'add-entity', kind:'dataset'}])
  if (next.status !== 'applied') throw Error('branch failed')
  assert.notEqual(next.entityIds[0], minted)
  const decoded = await creator.decodeDraft(creator.encodeDraft(creator.inspectHistory(next.history).draft))
  if (decoded.status !== 'decoded') throw Error(JSON.stringify(decoded))
  const output = creator.materializeDraft(decoded.draft)
  if (output.status !== 'materialized') throw Error('output failed')
  const graph = JSON.parse(new TextDecoder().decode(output.files.get('ro-crate-metadata.json') as Uint8Array))['@graph']
  assert.deepEqual(graph[1].unknown, {'@id':'#entity-1'})
  assert.equal(graph[1].name, 'Original')
  assert.deepEqual(output.files.get('notes.txt'), new TextEncoder().encode('original'))
})

test('bulk edits preserve extra imported manifest cells through undo and redo', async () => {
  let draft = creator.createDraft()
  const step = (change: creator.DraftChange) => {const result = creator.applyChange(draft, change); if (result.status !== 'applied') throw Error('setup'); draft = result.draft; return result.entityId}
  step({type:'add-study'})
  const specimenId = step({type:'add-entity', kind:'specimen'})
  const datasetId = step({type:'add-entity', kind:'dataset'})
  const file = {path:'image.tif', size:'10', datasetId, specimenId, type:'image' as const}
  step({type:'add-file', file})
  const output = creator.materializeDraft(draft)
  if (output.status !== 'materialized') throw Error('setup')
  const metadata = JSON.parse(output.files.get('ro-crate-metadata.json') as string)
  metadata['@graph'].find((node: {'@id':string}) => node['@id'] === '#file-list-schema').column.push({'@id':'#extra-column'})
  metadata['@graph'].push({'@id':'#extra-column', '@type':['csvw:Column'], columnName:'notes', propertyUrl:'http://example.org/note'})
  const table = (output.files.get('file_list.tsv') as string).replace(/\n$/, '').split('\n').map((line, i) => line + (i ? '\tretained' : '\tnotes')).join('\n') + '\n'
  const imported = await creator.importCrate(new Map([['ro-crate-metadata.json', JSON.stringify(metadata)], ['file_list.tsv', table]]), {metadataPaths:['ro-crate-metadata.json','file_list.tsv']})
  if (imported.status !== 'editable') throw Error('import failed')
  const edited = creator.applyHistoryChanges(creator.createHistory(imported.draft), [{type:'update-file', file:{...file, size:'11'}}, {type:'update-file', file:{...file, size:'12'}}])
  if (edited.status !== 'applied') throw Error('edit failed')
  const undone = creator.undo(edited.history)
  if (undone.status !== 'applied') throw Error('undo failed')
  const restored = creator.materializeDraft(creator.inspectHistory(undone.history).draft)
  if (restored.status !== 'materialized') throw Error('materialize failed')
  assert.equal(new TextDecoder().decode(restored.files.get('file_list.tsv') as Uint8Array), table)
  const redone = creator.redo(undone.history)
  if (redone.status !== 'applied') throw Error('redo failed')
  const changed = creator.materializeDraft(creator.inspectHistory(redone.history).draft)
  if (changed.status !== 'materialized') throw Error('materialize failed')
  assert.equal(new TextDecoder().decode(changed.files.get('file_list.tsv') as Uint8Array), table.replace('image.tif\t10\t', 'image.tif\t12\t'))
})
