import assert from 'node:assert/strict'
import test from 'node:test'
import {original, corrected} from '../../../../tests/reference/blank-node-diagnostics/checks.mjs'
import {assertDiagnosticCorrection} from '../../../../tests/reference/blank-node-diagnostics/correction-bounds.mjs'

test('a diagnostic correction cannot change outcomes, findings, severity, locations or input bytes', () => {
  assertDiagnosticCorrection(original, corrected)
  for (const change of [
    value => {delete value.diagnostic_correction},
    value => {value.diagnostic_correction.capture_sha256 = 'wrong'},
    value => {value.cases[0].status = 'valid'},
    value => {value.cases[0].inputs_sha256['file_list.tsv'] = 'wrong'},
    value => {value.cases[0].report.issues.ERROR.pop()},
    value => {value.cases[0].report.issues.ERROR[0].severity = 30},
    value => {value.cases[0].report.issues.ERROR[0].location_description = 'another node'},
    value => {value.cases[0].exception.type = 'another exception'},
  ]) {
    const copy = structuredClone(corrected)
    change(copy)
    assert.throws(() => assertDiagnosticCorrection(original, copy))
  }
})
