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
