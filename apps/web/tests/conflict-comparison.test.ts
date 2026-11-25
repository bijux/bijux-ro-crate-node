import {strict as assert} from 'node:assert'
import {test} from 'node:test'
import {applyChange, createDraft} from '@bijux/ro-crate-creator'
import {decodeRecovery, encodeRecovery} from '../src/drafts/recovery-codec.js'
import {compareRecoveries, MAX_COMPARISON_ITEMS} from '../src/features/editor/account/comparison.js'

function changed(draft:ReturnType<typeof createDraft>, change:Parameters<typeof applyChange>[1]) {
  const result = applyChange(draft, change)
  if (result.status !== 'applied') throw Error('setup')
  return result.draft
}

test('comparison describes study, record and pending-file changes without dropping the inputs', async () => {
  const study = changed(createDraft(), {type:'add-study'})
  const older = changed(study, {type:'set-field', entityId:'./', field:'name', value:'Older study'})
  const newer = changed(changed(older, {type:'set-field', entityId:'./', field:'name', value:'Newer study'}), {type:'add-entity', kind:'biosample'})
  const left = await decodeRecovery(encodeRecovery({draft:older, pending:[{id:'p:1',path:'old.tif',size:'1'}]}))
  const right = await decodeRecovery(encodeRecovery({draft:newer, pending:[{id:'p:2',path:'new.tif',size:'2'}]}))
  const result = compareRecoveries(left, right)
  assert.equal(result.status, 'compared')
  if (result.status !== 'compared') throw Error('expected comparison')
  assert.match(result.study.join(' '), /Older study.*Newer study/)
  assert.match(result.records.join(' '), /Added.*biosample/)
  assert.match(result.pending.join(' '), /old\.tif/)
  assert.match(result.pending.join(' '), /new\.tif/)
})

test('comparison limits displayed entries and reports omitted changes', async () => {
  const study = changed(createDraft(), {type:'add-study'})
  const pending = Array.from({length:MAX_COMPARISON_ITEMS + 5}, (_,index) => ({id:`p:${index + 1}`,path:`file-${index}.tif`,size:'1'}))
  const left = await decodeRecovery(encodeRecovery({draft:study,pending:[]}))
  const right = await decodeRecovery(encodeRecovery({draft:study,pending}))
  const result = compareRecoveries(left, right)
  assert.equal(result.status, 'compared')
  if (result.status !== 'compared') throw Error('expected comparison')
  assert.equal(result.pending.length, MAX_COMPARISON_ITEMS)
  assert.equal(result.pendingOmitted, 5)
})
