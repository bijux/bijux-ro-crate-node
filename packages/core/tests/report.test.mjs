import assert from 'node:assert/strict'
import test from 'node:test'
import {reportOf, SEVERITY} from '../src/index.js'

test('report preserves duplicate findings, severity and nullable locations', () => {
  const issue = {severity: SEVERITY.WARNING, message: 'same finding', location_description: null}
  const report = reportOf([issue, issue])
  issue.message = 'mutated'
  assert.equal(report.highest_error_level, 'WARNING')
  assert.equal(report.issues.WARNING.length, 2)
  assert.equal(report.issues.WARNING[0].message, 'same finding')
  assert.equal(Object.keys(report.issues).length, 5)
  assert.equal(reportOf([]).highest_error_level, null)
  assert.throws(() => reportOf([{severity: 0}]), /Unknown diagnostic/)
})
