import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createDraft, applyChange, inspectDraft} from '@bijux/ro-crate-creator'
import {encodeRecovery, decodeRecovery} from '../src/drafts/recovery-codec.js'

test('recovery retains unfinished duplicate listings and detached draft state', async () => {
  const changed = applyChange(createDraft(), {type:'add-study'})
  if (changed.status !== 'applied') throw Error('setup')
  const named = applyChange(changed.draft, {type:'set-field', entityId:'./', field:'name', value:'Recovery study'})
  if (named.status !== 'applied') throw Error('setup')
  const rows = [{id:'p:1', path:'images/a.tif', size:'4'}, {id:'p:2', path:'images/a.tif', size:'900719925474099312345'}]
  const encoded = encodeRecovery({draft:named.draft, pending:rows})
  rows[0].path = 'changed'
  const decoded = await decodeRecovery(encoded)
  assert.equal(decoded.status, 'decoded')
  if (decoded.status !== 'decoded') return
  assert.equal(inspectDraft(decoded.draft).study?.name, 'Recovery study')
  assert.deepEqual(decoded.pending.map(row => row.path), ['images/a.tif','images/a.tif'])
  assert.equal(decoded.pending[1].size, '900719925474099312345')
  assert.equal(decoded.materialization.status, 'blocked')
  if (decoded.materialization.status === 'blocked') assert.ok(decoded.materialization.issues.some(issue => issue.code === 'pending-file-listings'))
})

test('recovery rejects unrecognized fields and invalid pending metadata', async () => {
  const encoded = encodeRecovery({draft:createDraft(), pending:[]})
  const value = JSON.parse(encoded)
  value.pending = [{id:'p:1', path:'../bad', size:'2'}]
  assert.equal((await decodeRecovery(JSON.stringify(value))).status, 'rejected')
  value.pending = [{id:'p:1', path:'x', size:'2', payload:'bytes'}]
  assert.equal((await decodeRecovery(JSON.stringify(value))).status, 'rejected')
  assert.throws(() => encodeRecovery({draft:createDraft(), pending:[{id:'p:1',path:'x',size:'2'}, {id:'p:1',path:'y',size:'2'}]}))
  assert.equal((await decodeRecovery(encoded.replace('"version":1','"version":2'))).status, 'rejected')
})


test('a recovery draft with no pending listings can materialize', async () => {
  const changed = applyChange(createDraft(),{type:'add-study'})
  if (changed.status !== 'applied') throw Error('study')
  const decoded = await decodeRecovery(encodeRecovery({draft:changed.draft,pending:[]}))
  assert.equal(decoded.status,'decoded')
  if (decoded.status === 'decoded') assert.equal(decoded.materialization.status,'materialized')
})
