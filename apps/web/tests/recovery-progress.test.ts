import {test} from 'node:test'
import assert from 'node:assert/strict'
import {RecoveryProgress} from '../src/drafts/recovery-progress.js'

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
