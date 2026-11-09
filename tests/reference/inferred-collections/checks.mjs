import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {compareResult} from '../../parity/compare.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {assertCaptureRecord} from './capture-records.mjs'

const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)))
const freeze = value => {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
const pin = await read('../../../docs/compatibility/reference.json')
const original = freeze(await read('./original.json')), corrected = freeze(await read('./corrected.json'))
const correction = await read('./correction.json'), contract = await read('./contracts.json')
export const {cases} = await read('./inputs.json')
const registered = new Map(cases.map(item => [item.name, freeze(structuredClone(item))]))
const declaredLimits = new Map(Object.entries(await read('./limits.json')))
export const limits = new Map(declaredLimits)
const capturedOriginal = new Map(original.cases.map(row => [row.name, row]))
const correctedByName = new Map(corrected.cases.map(row => [row.name, row]))
export const python = new Map(capturedOriginal)
export const originalByName = python
const correctedCases = cases.filter(item => !declaredLimits.has(item.name))
const hash = values => createHash('sha256').update(JSON.stringify(values)).digest('hex')
export const reference = Object.freeze({reference: pin.commit, suite_sha256: hash(cases)})
assert.equal(original.commit, pin.commit)
assert.equal(corrected.commit, pin.commit)
assert.equal(original.corpus_sha256, hash(cases))
assert.equal(corrected.corpus_sha256, hash(correctedCases))
assert.equal(registered.size, cases.length)
assert.deepEqual(original.cases.map(row => row.name), cases.map(item => item.name))
assert.deepEqual(corrected.cases.map(row => row.name), correctedCases.map(item => item.name))
assert.deepEqual([...corrected.collection_correction.excluded_input_limits].sort(), [...declaredLimits.keys()].sort())
assert.equal(corrected.collection_correction.capture_sha256,
  createHash('sha256').update(await readFile(new URL('./capture.py', import.meta.url))).digest('hex'))
for (const [key, value] of Object.entries(correction)) assert.deepEqual(corrected.collection_correction[key], value)
for (const item of cases) {
  assertInputBytes(item, capturedOriginal.get(item.name))
  if (!declaredLimits.has(item.name)) assertInputBytes(item, correctedByName.get(item.name))
}
assert.equal(cases.length, contract.cases)
assert.equal(declaredLimits.size, contract.input_limits)
assert.equal(cases.length, 125)
assert.equal(declaredLimits.size, 3)
export const approvedDifferences = new Set(contract.approved_differences)
assert.equal(approvedDifferences.size, 36)
const observedDifferences = []
for (const item of correctedCases) {
  const actual = correctedByName.get(item.name), previous = capturedOriginal.get(item.name)
  compareResult(actual, actual, item.name)
  compareResult(previous, previous, item.name)
  let equal = true
  try {compareResult(actual, previous, item.name)} catch (error) {
    assert.ok(error instanceof assert.AssertionError)
    equal = false
  }
  if (equal) assert.deepEqual(actual, previous, item.name)
  else observedDifferences.push(item.name)
}
assert.deepEqual(observedDifferences.sort(), [...approvedDifferences].sort())
assert.equal(correctedCases.length - observedDifferences.length, contract.controls)
assert.equal(contract.controls, 86)
const ordinaryReference = await read('./ordinary-reference.json')
for (const row of ordinaryReference.cases) {
  assertInputBytes(registered.get(row.name), row)
  assertCaptureRecord(capturedOriginal.get(row.name), row)
}
assert.equal(ordinaryReference.cases.length, 14)

/** Corrected references remain exact; declared operational limits cannot approve. */
export function assertResult(item, actual) {
  const expectedInput = registered.get(item.name)
  assert.ok(expectedInput, 'Unknown collection contract input: ' + item.name)
  assert.deepEqual(item, expectedInput, 'Collection input differs from its immutable registration')
  assert.equal(JSON.stringify(item), JSON.stringify(expectedInput), 'Collection context/member order differs')
  assertInputBytes(item, capturedOriginal.get(item.name))
  if (!declaredLimits.has(item.name)) return compareResult(actual, correctedByName.get(item.name), item.name)
  assert.equal(actual.status, 'incomplete', item.name)
  assert.equal(actual.stage, 'preflight', item.name)
  assert.equal(actual.reason, declaredLimits.get(item.name), item.name)
  const info = capturedOriginal.get(item.name).report.issues.INFO
  compareResult(actual, {...capturedOriginal.get(item.name), status: 'incomplete', report: {
    highest_error_level: info.length ? 'INFO' : null,
    issues: {CRITICAL: [], ERROR: [], WARNING: [], INFO: info, DEBUG: []},
  }}, item.name)
}
