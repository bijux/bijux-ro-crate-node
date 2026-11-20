import assert from 'node:assert/strict'
import test from 'node:test'
import {ValidationSession as SourceSession} from '../../src/browser.js'
import {ValidationSession as BuiltSession} from '../../dist/browser.js'

test('built browser session preserves the public constructor name and prototype', () => {
  assert.equal(SourceSession.name, 'ValidationSession')
  assert.equal(BuiltSession.name, 'ValidationSession')
  const session = new BuiltSession({workerFactory: () => {throw new Error('worker not requested')}})
  try {
    assert.equal(session.constructor, BuiltSession)
    assert.ok(session instanceof BuiltSession)
  } finally {session.dispose()}
})
