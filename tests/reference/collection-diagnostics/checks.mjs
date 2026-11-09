import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {compareResult} from '../../parity/compare.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'

const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)))
const hash = value => createHash('sha256').update(value).digest('hex')
const freeze = value => {
  if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value)}
  return value
}
const recursiveCases = freeze((await read('./inputs.json')).cases)
const ordinaryCases = freeze((await read('./ordinary-inputs.json')).cases)
const registeredCases = freeze([...ordinaryCases, ...recursiveCases])
export const cases = structuredClone(registeredCases)
const registered = new Map(registeredCases.map(item => [item.name, item]))
const original = freeze(await read('./original.json')), corrected = freeze(await read('./corrected.json'))
const ordinary = freeze(await read('./ordinary-reference.json'))
const sourceContract = await read('./correction.json')
const correction = {...sourceContract, capture_sha256: hash(await readFile(new URL('./capture.py', import.meta.url)))}
const pin = await read('../../../docs/compatibility/reference.json')
const expectedLabels = new Map([
  ['collection-diagnostics/cycle', '( Literal("item") <http://recursion.too.deep> )'],
  ['collection-diagnostics/cycle-tail', '( Literal("item") Literal("tail") <http://recursion.too.deep> )'],
  ['collection-diagnostics/cycle-tail-precreated', '( Literal("item") Literal("tail") <http://recursion.too.deep> )'],
])
export const reference = Object.freeze({reference: pin.commit, suite_sha256: hash(JSON.stringify(registeredCases))})
assert.deepEqual(recursiveCases.map(item => item.name), [...expectedLabels.keys()])
assert.equal(ordinaryCases.length, 12)
assert.equal(registeredCases.length, 15)
assert.equal(ordinary.commit, pin.commit)
assert.equal(ordinary.corpus_sha256, hash(JSON.stringify(ordinaryCases)))
assert.deepEqual(ordinary.cases.map(item => item.name), ordinaryCases.map(item => item.name))
for (const [index, item] of ordinaryCases.entries()) assertInputBytes(item, ordinary.cases[index])
const originalMap = new Map([...ordinary.cases, ...original.cases].map(item => [item.name, item]))
const correctedMap = new Map([...ordinary.cases, ...corrected.cases].map(item => [item.name, item]))
for (const values of [registered, originalMap, correctedMap]) assert.equal(values.size, registeredCases.length)
export const originalByName = new Map(originalMap)
export const python = originalByName
export const approvedDifferences = new Set(expectedLabels.keys())

/** Only the three proven missing findings may change in corrected captures. */
export function assertCaptureBounds(before, after) {
  const {cases: originalRows, ...originalMetadata} = before
  const {cases: correctedRows, collection_diagnostic_correction, ...correctedMetadata} = after
  assert.deepEqual(collection_diagnostic_correction, correction)
  assert.deepEqual(correctedMetadata, originalMetadata)
  assert.equal(before.commit, pin.commit)
  assert.equal(before.corpus_sha256, hash(JSON.stringify(recursiveCases)))
  assert.deepEqual(originalRows.map(item => item.name), [...expectedLabels.keys()])
  assert.deepEqual(correctedRows.map(item => item.name), [...expectedLabels.keys()])
  for (const [index, item] of recursiveCases.entries()) {
    const old = originalRows[index], fixed = correctedRows[index]
    assertInputBytes(item, old); assertInputBytes(item, fixed)
    assert.equal(old.status, 'valid')
    assert.equal(old.error_mode_exit_code, 0)
    assert.equal(old.exception, null)
    assert.deepEqual(old.report.issues.ERROR, [])
    const message = 'Less than 1 values on ' + expectedLabels.get(item.name) +
      '->[ sh:inversePath <http://schema.org/hasPart> ]'
    const finding = {message, severity: 40, location_description: 'At ro-crate object with @id: file'}
    const report = structuredClone(old.report)
    report.highest_error_level = 'ERROR'
    report.issues.ERROR.push(finding)
    const exception = {type: 'ExceptionGroup', message: 'Validation failed. (1 sub-exception)', children: [
      {type: 'Exception', message: finding.location_description + ': \n   ' + message},
    ]}
    assert.deepEqual(fixed, {...old, status: 'invalid', error_mode_exit_code: 1, report, exception})
  }
}
assertCaptureBounds(original, corrected)

export function assertResult(item, actual) {
  const stored = registered.get(item.name)
  assert.ok(stored, 'Unregistered collection diagnostic input')
  assert.deepEqual(item, stored)
  assert.equal(JSON.stringify(item), JSON.stringify(stored))
  assertInputBytes(item, originalMap.get(item.name))
  compareResult(actual, correctedMap.get(item.name), item.name)
}
