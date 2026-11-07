import assert from 'node:assert/strict'
import test from 'node:test'
import {compareResult} from './compare.mjs'
import {normalizeText} from './normalize.mjs'
import {assertInputBytes} from './inputs.mjs'

const issue = {message: 'Required field', severity: 40, location_description: 'entity #a'}
const expected = {status: 'invalid', root: '/oracle', root_uri: 'file:///oracle',
  report: {highest_error_level: 'ERROR', issues: {CRITICAL: [], ERROR: [issue, issue], WARNING: [], INFO: [], DEBUG: []}}}

test('independent input byte hashes reject changes omissions and extra files', () => {
  const item = {name: 'UTF-8 and byte inputs', files: {'metadata.json': 'é\n', 'bytes.tsv': [0, 255]}}
  // SHA256 values captured independently with Python hashlib over these bytes.
  const receipt = {inputs_sha256: {
    'metadata.json': 'edd3a863872a04239eb29ad4bc12fc892b3d4ae57cc7e786a3697816f8e141c2',
    'bytes.tsv': '06eb7d6a69ee19e5fbdf749018d3d2abfa04bcbd1365db312eb86dc7169389b8',
  }}
  assertInputBytes(item, receipt)
  for (const mutate of [
    c => {c.files['metadata.json'] = 'e\n'}, c => {c.files['bytes.tsv'][1] = 254},
    c => {delete c.files['bytes.tsv']}, c => {c.files['extra'] = ''},
  ]) {
    const changed = structuredClone(item)
    mutate(changed)
    assert.throws(() => assertInputBytes(changed, receipt))
  }
})

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
    value => {value.report.issues.UNKNOWN = [issue]},
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
