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
