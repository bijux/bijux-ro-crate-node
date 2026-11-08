import assert from 'node:assert/strict'
import test from 'node:test'
import {cases, assertUpstreamResult, approvedDifferences, python} from '../../../../tests/reference/upstream-defects/checks.mjs'
import {makeCases} from '../../../../tests/parity/cases.mjs'
import {correctedConstraintReport} from '../../../../tests/reference/upstream-defects/constraint-report.mjs'
import {contract} from '../../../../tests/reference/profile-literal-targets/checks.mjs'
import {correctedByName} from '../../../../tests/reference/blank-node-diagnostics/checks.mjs'

const report = error => ({highest_error_level: error ? 'ERROR' : null,
  issues: {CRITICAL: [], ERROR: error ? [{message: error, severity: 40, location_description: null}] : [],
    WARNING: [], INFO: [], DEBUG: []}})

test('confirmed defects cannot pass by copying upstream approvals or rejecting for unrelated reasons', () => {
  for (const item of [cases.find(item => item.name.includes('boolean') && approvedDifferences.has(item.name)),
    cases.find(item => item.name.endsWith('decimal-unnamed-website'))]) {
    assert.ok(item)
    assert.throws(() => assertUpstreamResult(item, {status: 'valid', report: report()}))
    assert.throws(() => assertUpstreamResult(item, {status: 'invalid', report: report('unrelated finding')}))
  }
})

test('corrected diagnostic contracts reject arbitrary message replacement', () => {
  const item = cases.find(item => item.name === 'inverse-path/blank-explicit-same-as')
  const expected = correctedByName.get(item.name)
  assertUpstreamResult(item, {status: expected.status, report: expected.report})
  const changed = structuredClone(expected.report)
  changed.issues.ERROR[0].message = 'Different recursive diagnostic'
  assert.throws(() => assertUpstreamResult(item, {status: expected.status, report: changed}))
})

test('approved differences stay outside ordinary strict case discovery', async () => {
  const ordinary = new Set((await makeCases()).map(item => item.name))
  for (const name of approvedDifferences) assert.ok(!ordinary.has(name), name)
})


test('confirmed constraint corrections reject every extra or altered finding', () => {
  for (const item of cases.filter(item => approvedDifferences.has(item.name) &&
    (Object.hasOwn(contract.corrected_findings, item.name) || item.name.startsWith('profile-converter-failures/')))) {
    const finding = contract.corrected_findings[item.name] ?? {
      message: 'A WebSite MUST have a `name` property', severity: 40,
      location_description: 'At ro-crate object with @id: ./#unnamed'}
    const result = {status: 'invalid', report: correctedConstraintReport(python.get(item.name), finding)}
    assertUpstreamResult(item, result)
    for (const change of [
      value => {value.report.issues.ERROR.push({message: 'Unrelated failure', severity: 40, location_description: null})},
      value => {value.report.issues.WARNING.push({message: 'Unrelated warning', severity: 30, location_description: null})},
      value => {value.report.issues.INFO.push({message: 'Unrelated information', severity: 20, location_description: null})},
      value => {value.report.issues.ERROR[0].location_description = 'Another field'},
      value => {value.report.issues.ERROR[0].message = 'Another error'},
    ]) {
      const copy = structuredClone(result)
      change(copy)
      assert.throws(() => assertUpstreamResult(item, copy), undefined, 'Reject report mutation for ' + item.name)
    }
  }
})
