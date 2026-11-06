import assert from 'node:assert/strict'
import {normalizeReport} from './normalize.mjs'

export function compareResult(actual, expected, name) {
  const options = {anonymousRoot: name === 'mutation/descriptor-about-empty'}
  assert.equal(actual.status, expected.status, 'Completion status differs')
  assert.deepEqual(normalizeReport(actual.report, '/crate', 'file:///crate', options),
    normalizeReport(expected.report, expected.root, expected.root_uri, options))
}
