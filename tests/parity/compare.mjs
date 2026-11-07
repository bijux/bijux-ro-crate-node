import assert from 'node:assert/strict'
import {normalizeReport} from './normalize.mjs'

function assertReport(report) {
  const levels = {CRITICAL: 50, ERROR: 40, WARNING: 30, INFO: 20, DEBUG: 10}
  let highest = null
  for (const [level, severity] of Object.entries(levels)) {
    assert.ok(Array.isArray(report?.issues?.[level]), 'Missing diagnostic bucket: ' + level)
    for (const issue of report.issues[level]) {
      assert.equal(typeof issue.message, 'string')
      assert.equal(issue.severity, severity, 'Diagnostic severity is in the wrong bucket')
      assert.ok(issue.location_description === null || typeof issue.location_description === 'string')
    }
    if (highest === null && report.issues[level].length) highest = level
  }
  assert.equal(report.highest_error_level, highest, 'Highest diagnostic severity is inconsistent')
}

export function compareResult(actual, expected, name) {
  assertReport(actual.report)
  assertReport(expected.report)
  const options = {anonymousRoot: name === 'mutation/descriptor-about-empty'}
  assert.equal(actual.status, expected.status, 'Completion status differs')
  assert.deepEqual(normalizeReport(actual.report, '/crate', 'file:///crate', options),
    normalizeReport(expected.report, expected.root, expected.root_uri, options))
}
