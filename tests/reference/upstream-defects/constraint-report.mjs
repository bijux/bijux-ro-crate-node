import assert from 'node:assert/strict'

/** Profile rejection stops before the parser's later manifest-wide warnings. */
export function correctedConstraintReport(original, finding) {
  assert.equal(original.status, 'valid')
  assert.deepEqual(original.report.issues.ERROR, [])
  assert.deepEqual(original.report.issues.CRITICAL, [])
  return {highest_error_level: 'ERROR', issues: {CRITICAL: [], ERROR: [finding],
    WARNING: [], INFO: structuredClone(original.report.issues.INFO), DEBUG: []}}
}
