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
