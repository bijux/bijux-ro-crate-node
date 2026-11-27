import {test} from 'node:test'
import assert from 'node:assert/strict'
import {RecoveryProgress, commitVerifiedReplacement, recoveryWaitNotice} from '../../src/drafts/recovery-progress.js'

test('completion of an older recovery cannot mark newer work saved or failed', () => {
  const statuses:string[] = []
  const progress = new RecoveryProgress(status => statuses.push(status))
  const first = progress.changed()
  const second = progress.changed()
  progress.saved(first)
  progress.failed(first, Error('old write'))
  assert.match(statuses.at(-1)!, /not yet saved/i)
  progress.failed(second, Error('quota'))
  assert.match(statuses.at(-1)!, /quota/)
  const third = progress.changed()
  progress.saved(second)
  assert.match(statuses.at(-1)!, /not yet saved/i)
  progress.saved(third)
  assert.match(statuses.at(-1)!, /saved in this browser/i)
})

test('removing an old current copy cannot mark newer edits unrecovered', () => {
  const statuses:string[] = []
  const progress = new RecoveryProgress(status => statuses.push(status))
  const before = progress.changed()
  const after = progress.changed()
  progress.saved(after)
  progress.removedCurrent(before)
  assert.match(statuses.at(-1)!, /saved in this browser/i)
  progress.removedCurrent(after)
  assert.match(statuses.at(-1)!, /no browser recovery copy/i)
})

test('failed recovery does not suggest that a full backup is guaranteed', () => {
  const statuses:string[] = []
  const progress = new RecoveryProgress(status => statuses.push(status))
  progress.failed(progress.changed(), Error('quota'))
  assert.match(statuses.at(-1)!, /latest changes are not confirmed in browser recovery/i)
  assert.match(statuses.at(-1)!, /metadata export may be available/i)
})

test('replacement snapshots follow only the latest completed recovery generation', () => {
  const progress = new RecoveryProgress(() => {})
  const initial = progress.snapshot(); assert.equal(initial.state,'initial')
  const first = progress.changed(); const pending = progress.snapshot(); assert.equal(pending.state,'pending')
  assert.equal(progress.matches(initial),false)
  progress.saved(first); const saved = progress.snapshot(); assert.equal(saved.state,'saved'); assert.equal(progress.matches(pending),false)
  const second = progress.changed(); progress.failed(first,Error('stale'))
  assert.equal(progress.snapshot().state,'pending')
  progress.failed(second,Error('quota')); const failed = progress.snapshot(); assert.equal(failed.state,'failed')
  progress.saved(first); assert.equal(progress.matches(failed),true)
  progress.removedCurrent(second); assert.equal(progress.snapshot().state,'removed'); assert.equal(progress.matches(failed),false)
})


test('a stale caller cannot commit after the last asynchronous recovery verification', async () => {
  let release!:() => void, entered!:() => void, current = true, adopted = 0
  const held = new Promise<void>(resolve => {release = resolve}), started = new Promise<void>(resolve => {entered = resolve})
  const result = commitVerifiedReplacement(async () => {entered(); await held; return true}, () => current, () => {adopted++; return true})
  await started; current = false; release()
  assert.equal(await result,false); assert.equal(adopted,0)
})

test('a queued invalidation before verification resumes prevents the real commit callback', async () => {
  let current = true, adopted = 0
  const result = commitVerifiedReplacement(async () => {queueMicrotask(() => {current = false}); return true}, () => current, () => {adopted++; return true})
  assert.equal(await result,false); assert.equal(adopted,0)
})

test('commit runs in the same turn as the final caller check', async () => {
  const events:string[] = []
  const result = await commitVerifiedReplacement(async () => true, () => {events.push('check'); queueMicrotask(() => events.push('invalidation')); return true}, () => {events.push('commit'); return true})
  assert.equal(result,true)
  assert.deepEqual(events,['check','commit','invalidation'])
})

test('recovery wait feedback clears only when both operations have finished', () => {
  assert.equal(recoveryWaitNotice('wait','wait',false,false),'')
  assert.equal(recoveryWaitNotice('wait','wait',true,false),'wait')
  assert.equal(recoveryWaitNotice('wait','wait',false,true),'wait')
  assert.equal(recoveryWaitNotice('unrelated','wait',false,false),'unrelated')
})
