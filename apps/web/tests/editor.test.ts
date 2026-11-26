import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newEditor, changeStudy, exportMetadata} from '../src/features/editor/document.ts'

test('editor exports current changes and reports a missing study', () => {
  let draft = newEditor()
  assert.equal(exportMetadata(draft).status, 'blocked')
  draft = changeStudy(draft, {type: 'add-study'})
  draft = changeStudy(draft, {type: 'set-field', entityId: './', field: 'name', value: 'Cells'})
  const result = exportMetadata(draft)
  assert.equal(result.status, 'materialized')
  assert.equal(JSON.parse(result.metadata)['@graph'][1].name, 'Cells')
})

test('contribution commands preserve author order and reject referenced deletion', async () => {
  const {inspectDraft} = await import('@bijux/ro-crate-creator')
  const {addContribution, applyEditorChange} = await import('../src/features/editor/document.js')
  let draft = changeStudy(newEditor(), {type: 'add-study'})
  const invalid = addContribution(draft, 'affiliation', 'author')
  assert.equal(invalid.status, 'rejected')
  assert.equal(inspectDraft(draft).entities.length, 0)
  const first = addContribution(draft, 'contributor', 'author')
  assert.equal(first.status, 'applied')
  if (first.status !== 'applied') return
  draft = first.draft
  const second = addContribution(draft, 'contributor', 'author')
  if (second.status !== 'applied') throw new Error('second contributor')
  draft = second.draft
  const institution = addContribution(draft, 'affiliation')
  if (institution.status !== 'applied') throw new Error('affiliation')
  draft = institution.draft
  for (const author of [first.entityId, second.entityId]) {
    const result = applyEditorChange(draft, {type: 'add-reference', sourceId: author, relationship: 'memberOf', targetId: institution.entityId})
    if (result.status !== 'applied') throw new Error('association')
    draft = result.draft
  }
  const blocked = applyEditorChange(draft, {type: 'delete-entity', entityId: institution.entityId})
  assert.equal(blocked.status, 'rejected')
  if (blocked.status === 'rejected') assert.equal(blocked.references?.length, 2)
  const moved = applyEditorChange(draft, {type: 'move-author', entityId: second.entityId, index: 0})
  if (moved.status !== 'applied') throw new Error('order')
  assert.deepEqual(inspectDraft(moved.draft).study?.references?.author, [second.entityId, first.entityId])
})

test('scientific relationship labels distinguish records with identical names', async () => {
  const {displayName} = await import('../src/features/editor/scientific/records.js')
  const {inspectDraft, applyChange} = await import('@bijux/ro-crate-creator')
  let draft = changeStudy(newEditor(), {type:'add-study'})
  for (const kind of ['biosample','specimen','preparation-protocol','acquisition-protocol','dataset'] as const) {
    const records = []
    for (let index = 0; index < 2; index++) {
      const added = applyChange(draft,{type:'add-entity',kind})
      if (added.status !== 'applied') throw Error('record')
      draft = changeStudy(added.draft,kind === 'specimen' ? {type:'set-label',entityId:added.entityId,value:'Shared record'} : {type:'set-field',entityId:added.entityId,field:'name',value:'Shared record'})
      records.push(added.entityId)
    }
    const view = inspectDraft(draft)
    const names = records.map(id => displayName(view.entities.find(entity => entity.id === id)!,view))
    assert.equal(new Set(names).size,2,`${kind} choices must remain distinguishable`)
    for (const [index,label] of names.entries()) assert.ok(label.includes(records[index]!))
  }
})

test('editable imported metadata remains exportable with its original bytes', async () => {
  const {importCrate} = await import('@bijux/ro-crate-creator')
  const fresh = exportMetadata(changeStudy(newEditor(),{type:'add-study'}))
  if (fresh.status !== 'materialized') throw Error('fresh metadata')
  const original = new TextEncoder().encode('\n' + fresh.metadata + '\r\n')
  const imported = await importCrate(new Map([['ro-crate-metadata.json',original]]),{metadataPaths:['ro-crate-metadata.json']})
  assert.equal(imported.status,'editable')
  if (imported.status !== 'editable') return
  const exported = exportMetadata(imported.draft)
  assert.equal(exported.status,'materialized')
  if (exported.status === 'materialized') assert.deepEqual(exported.files.get('ro-crate-metadata.json'),original)
})
