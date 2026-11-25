import assert from 'node:assert/strict'
import {test} from 'node:test'
import {applyChange, createDraft, inspectDraft, materializeDraft, importCrate, encodeDraft, decodeDraft, createHistory, applyHistoryChanges, inspectHistory, undo, redo, type DraftChange} from '../../src/index.js'

test('specimen labels survive backup and history without appearing in metadata', async () => {
  let draft = createDraft()
  const step = (change: DraftChange) => {const result = applyChange(draft,change); if (result.status !== 'applied') throw Error('change'); draft = result.draft; return result.entityId}
  step({type:'add-study'})
  const specimen = step({type:'add-entity',kind:'specimen'})
  step({type:'set-label',entityId:specimen,value:'Sample A'})
  const output = materializeDraft(draft)
  if (output.status !== 'materialized') throw Error('export')
  const graph = JSON.parse(output.files.get('ro-crate-metadata.json') as string)['@graph'] as Array<Record<string,unknown>>
  assert.equal(Object.hasOwn(graph.find(node => node['@id'] === specimen)!,'label'),false)
  assert.equal(Object.hasOwn(graph.find(node => node['@id'] === specimen)!,'name'),false)
  const decoded = await decodeDraft(encodeDraft(draft))
  assert.equal(decoded.status,'decoded')
  if (decoded.status !== 'decoded') return
  assert.equal(inspectDraft(decoded.draft).entities.find(entity => entity.id === specimen)?.label,'Sample A')
  const changed = applyHistoryChanges(createHistory(decoded.draft),[{type:'set-label',entityId:specimen,value:'Renamed'}])
  if (changed.status !== 'applied') throw Error('history')
  const previous = undo(changed.history)
  if (previous.status !== 'applied') throw Error('undo')
  assert.equal(inspectDraft(inspectHistory(previous.history).draft).entities.find(entity => entity.id === specimen)?.label,'Sample A')
  const next = redo(previous.history)
  if (next.status !== 'applied') throw Error('redo')
  assert.equal(inspectDraft(inspectHistory(next.history).draft).entities.find(entity => entity.id === specimen)?.label,'Renamed')
})

test('label-only edit to imported metadata preserves original bytes and remains recoverable', async () => {
  let draft = createDraft()
  const study = applyChange(draft,{type:'add-study'}); if (study.status !== 'applied') throw Error('study'); draft = study.draft
  const added = applyChange(draft,{type:'add-entity',kind:'specimen'}); if (added.status !== 'applied') throw Error('specimen'); draft = added.draft
  const initial = materializeDraft(draft); if (initial.status !== 'materialized') throw Error('export')
  const imported = await importCrate(initial.files,{metadataPaths:['ro-crate-metadata.json']}); if (imported.status !== 'editable') throw Error('import')
  const changed = applyChange(imported.draft,{type:'set-label',entityId:added.entityId,value:'Local specimen'})
  if (changed.status !== 'applied') throw Error('label')
  const output = materializeDraft(changed.draft); if (output.status !== 'materialized') throw Error('export')
  assert.deepEqual(output.files.get('ro-crate-metadata.json'),new TextEncoder().encode(initial.files.get('ro-crate-metadata.json') as string))
  const reopened = await decodeDraft(encodeDraft(changed.draft))
  assert.equal(reopened.status,'decoded',reopened.status === 'rejected' ? reopened.issues.join(', ') : '')
  if (reopened.status !== 'decoded') return
  assert.equal(inspectDraft(reopened.draft).entities.find(entity => entity.id === added.entityId)?.label,'Local specimen')
  const restored = materializeDraft(reopened.draft); if (restored.status !== 'materialized') throw Error('export')
  assert.deepEqual(restored.files.get('ro-crate-metadata.json'),output.files.get('ro-crate-metadata.json'))
  assert.equal(applyChange(reopened.draft,{type:'set-label',entityId:'./',value:'no'}).status,'rejected')
  assert.equal(applyChange(reopened.draft,{type:'set-label',entityId:added.entityId,value:123} as unknown as DraftChange).status,'rejected')
})
