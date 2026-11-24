import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {applyChange, createDraft, inspectDraft, materializeDraft} from '../../src/index.js'

test('study identity and descriptor reference survive edits and repeated exports', () => {
  const empty = createDraft()
  const added = applyChange(empty, {type: 'add-study'})
  assert.equal(added.status, 'applied')
  if (added.status !== 'applied') return
  const named = applyChange(added.draft, {type: 'set-field', entityId: added.entityId, field: 'name', value: 'Original name'})
  if (named.status !== 'applied') throw Error('name was not set')
  const renamed = applyChange(named.draft, {type: 'set-field', entityId: named.entityId, field: 'name', value: 'Microscopy study'})
  assert.equal(renamed.status, 'applied')
  if (renamed.status !== 'applied') return
  const first = materializeDraft(renamed.draft)
  const second = materializeDraft(renamed.draft)
  assert.equal(first.status, 'materialized')
  assert.equal(second.status, 'materialized')
  if (first.status !== 'materialized' || second.status !== 'materialized') return
  assert.equal(first.files.get('ro-crate-metadata.json'), second.files.get('ro-crate-metadata.json'))
  const metadata = JSON.parse(first.files.get('ro-crate-metadata.json') as string)
  const expected = JSON.parse(readFileSync(new URL('./fixtures/pilot-study.json', import.meta.url), 'utf8'))
  assert.deepEqual(metadata, expected)
  assert.deepEqual(metadata['@graph'][0].about, {'@id': renamed.entityId})
  assert.equal(added.entityId, './')
  assert.equal(inspectDraft(renamed.draft).revision, 3)
  assert.equal(inspectDraft(empty).study, null)
})

test('views and exported maps are detached and failed changes are atomic', () => {
  const added = applyChange(createDraft(), {type: 'add-study'})
  if (added.status !== 'applied') throw Error('study was not added')
  const view = inspectDraft(added.draft)
  ;(view.study as {name?: string}).name = 'outside'
  const output = materializeDraft(added.draft)
  if (output.status !== 'materialized') throw Error('study was not materialized')
  ;(output.files as Map<string, unknown>).clear()
  assert.equal(inspectDraft(added.draft).study?.name, undefined)
  assert.equal(materializeDraft(added.draft).status, 'materialized')
  const failed = applyChange(added.draft, {type: 'set-field', entityId: '#missing', field: 'description', value: 'x'})
  assert.equal(failed.status, 'rejected')
  assert.equal(inspectDraft(added.draft).revision, 1)
  assert.equal(applyChange(added.draft, {type: 'add-study'}).status, 'rejected')
})

test('incomplete fields remain editable without invented accession or date', () => {
  const added = applyChange(createDraft(), {type: 'add-study'})
  if (added.status !== 'applied') throw Error('study was not added')
  const changed = applyChange(added.draft, {type: 'set-field', entityId: './', field: 'description', value: ''})
  if (changed.status !== 'applied') throw Error('field was not set')
  assert.equal(inspectDraft(changed.draft).study?.description, '')
  const output = materializeDraft(changed.draft)
  if (output.status !== 'materialized') throw Error('study was not materialized')
  const study = JSON.parse(output.files.get('ro-crate-metadata.json') as string)['@graph'][1]
  assert.equal(study.description, '')
  assert.equal(Object.hasOwn(study, 'accessionId'), false)
  assert.equal(Object.hasOwn(study, 'datePublished'), false)
})

test('runtime invalid changes and prototype fields cannot alter the document', () => {
  const added = applyChange(createDraft(), {type: 'add-study'})
  if (added.status !== 'applied') throw Error('study was not added')
  const bad = {type: 'set-field', entityId: './', field: '__proto__', value: 'bad'} as unknown as Parameters<typeof applyChange>[1]
  assert.equal(applyChange(added.draft, bad).status, 'rejected')
  assert.equal(applyChange(added.draft, {type: 'set-field', entityId: './', field: 'name', value: 1} as unknown as Parameters<typeof applyChange>[1]).status, 'rejected')
  assert.deepEqual(inspectDraft(added.draft), {revision: 1, study: {id: './'}, entities: [], files: []})
  const repeat = applyChange(added.draft, {type: 'set-field', entityId: './', field: 'name', value: ''})
  if (repeat.status !== 'applied') throw Error('field was not set')
  const same = applyChange(repeat.draft, {type: 'set-field', entityId: './', field: 'name', value: ''})
  if (same.status !== 'applied') throw Error('repeated field was not accepted')
  assert.equal(inspectDraft(same.draft).revision, 3)
  const cleared = applyChange(same.draft, {type: 'set-field', entityId: './', field: 'name', value: null})
  if (cleared.status !== 'applied') throw Error('field was not cleared')
  assert.equal(inspectDraft(cleared.draft).study?.name, undefined)
})
