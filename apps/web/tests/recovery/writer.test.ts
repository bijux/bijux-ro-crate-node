import assert from 'node:assert/strict'
import test from 'node:test'
import {RecoveryWriter} from '../../src/drafts/recovery-writer.js'
import type {RecoveryRecord} from '../../src/drafts/recovery-store.js'

function deferred() {
  let release!:() => void
  const promise = new Promise<void>(resolve => {release = resolve})
  return {promise, release}
}

test('a stale delete cannot remove an in-flight newer recovery write', async () => {
  const writing = deferred(), release = deferred()
  let record:RecoveryRecord = {id:'current', revision:1, savedAt:1, backup:'before'}
  const store = {
    async save(id:string, expected:number|null, backup:string) {
      assert.equal(id, 'current'); assert.equal(expected, 1)
      writing.release(); await release.promise
      return record = {...record, revision:2, backup}
    },
    async remove(id:string, expected:number) {
      assert.equal(id, record.id)
      if (record.revision !== expected) throw Error('This recovery copy changed in another tab')
      throw Error('Must not delete newer work')
    },
  }
  const writer = new RecoveryWriter('current', () => 'replacement')
  await writer.save({save:async () => record, remove:store.remove}, 'before')
  const save = writer.save(store, 'newer')
  await writing.promise
  const removal = writer.remove(store, {id:'current', revision:1, savedAt:1})
  release.release()
  await save
  await assert.rejects(removal, /changed in another tab/)
  assert.equal(record.backup, 'newer')
  assert.equal(record.revision, 2)
  await writer.save({save:async (id, expected, backup) => {
    assert.equal(id, 'current'); assert.equal(expected, 2)
    return record = {...record, revision:3, backup}
  }, remove:store.remove}, 'latest')
  assert.equal(record.backup, 'latest')
})

test('an edit during deletion saves under a fresh recovery id', async () => {
  const deleting = deferred(), release = deferred()
  let record:RecoveryRecord | undefined = {id:'current', revision:1, savedAt:1, backup:'before'}
  const store = {
    async save(id:string, expected:number|null, backup:string) {
      assert.equal(id, 'replacement'); assert.equal(expected, null)
      return record = {id, revision:1, savedAt:2, backup}
    },
    async remove(id:string, expected:number) {
      assert.equal(id, 'current'); assert.equal(expected, 1)
      deleting.release(); await release.promise; record = undefined
    },
  }
  const writer = new RecoveryWriter('current', () => 'replacement')
  await writer.save({save:async () => record!, remove:store.remove}, 'before')
  const removal = writer.remove(store, {id:'current', revision:1, savedAt:1})
  await deleting.promise
  const save = writer.save(store, 'after')
  release.release()
  await removal; await save
  assert.deepEqual(record, {id:'replacement', revision:1, savedAt:2, backup:'after'})
})


test('deleting a different recovery copy preserves the current revision', async () => {
  const writer = new RecoveryWriter('current', () => 'replacement')
  const saved:RecoveryRecord = {id:'current', revision:1, savedAt:1, backup:'before'}
  await writer.save({save:async () => saved, remove:async () => {}}, 'before')
  assert.equal(await writer.remove({save:async () => saved, remove:async (id, revision) => {assert.equal(id, 'other'); assert.equal(revision, 9)}}, {id:'other', revision:9, savedAt:1}), false)
  await writer.save({save:async (id, expected, backup) => {assert.equal(id, 'current'); assert.equal(expected, 1); return {...saved, revision:2, backup}}, remove:async () => {}}, 'after')
})
