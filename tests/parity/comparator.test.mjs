import assert from 'node:assert/strict'
import test from 'node:test'
import {compareResult} from './compare.mjs'
import {normalizeText} from './normalize.mjs'

const issue = {message: 'Required field', severity: 40, location_description: 'entity #a'}
const expected = {status: 'invalid', root: '/oracle', root_uri: 'file:///oracle',
  report: {highest_error_level: 'ERROR', issues: {CRITICAL: [], ERROR: [issue, issue], WARNING: [], INFO: [], DEBUG: []}}}

test('each meaningful result change fails independent comparison', () => {
  compareResult(structuredClone(expected), expected, 'control')
  for (const change of [
    value => {value.status = 'valid'},
    value => {value.report.highest_error_level = null},
    value => {value.report.issues.ERROR[0].message = 'Other field'},
    value => {value.report.issues.ERROR[0].severity = 30},
    value => {value.report.issues.ERROR[0].location_description = 'entity #b'},
    value => {value.report.issues.ERROR.pop()},
    value => {delete value.report.issues.WARNING},
    value => {value.report.issues.INFO.push({message: 'Wrong bucket', severity: 40, location_description: null})},
  ]) {
    const actual = structuredClone(expected)
    change(actual)
    assert.throws(() => compareResult(actual, expected, 'control'))
  }
})

test('run-root and known unordered diagnostic normalization is narrow', () => {
  assert.equal(normalizeText('At /oracle/path', '/oracle', 'file:///oracle'), 'At crate:/path')
  assert.equal(normalizeText('Untouched /oracle-other/path', '/oracle', ''), 'Untouched /oracle-other/path')
  assert.equal(normalizeText('User list: z, a', '', ''), 'User list: z, a')
})


test('diagnostic multisets preserve distinct Unicode spellings despite collation ties', () => {
  const composed = {...issue, message: '\u00e9'}
  const decomposed = {...issue, message: 'e\u0301'}
  const wanted = structuredClone(expected)
  wanted.report.issues.ERROR = [composed, composed, decomposed]
  const actual = structuredClone(wanted)
  actual.report.issues.ERROR.reverse()
  compareResult(actual, wanted, 'Unicode order')
  actual.report.issues.ERROR = [decomposed, composed, decomposed]
  assert.throws(() => compareResult(actual, wanted, 'Unicode multiplicity'))
})
