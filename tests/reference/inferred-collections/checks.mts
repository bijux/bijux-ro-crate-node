import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {compareResult} from '../../parity/compare.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {assertCaptureRecord} from './capture-records.mjs'

import type {ReferenceCase} from '../../parity/reference-fixtures.js'
import type {ValidationResult} from '../../../packages/validator/src/index.js'
import type {CaptureRecord} from './capture-records.mjs'
type Case = ReferenceCase & {contexts?: Record<string, unknown>; observe_error_nodes?: boolean}
type Correction = {excluded_input_limits: unknown[]; rules_sha256: string; capture_sha256: string; [key: string]: unknown}
type Capture = {commit: string; corpus_sha256: string; cases: CaptureRecord[]; collection_correction: Correction}
const read = <T,>(name: string): Promise<T> => readFile(new URL(name, import.meta.url), 'utf8').then(JSON.parse)
const freeze = <T,>(value: T): T => {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
const pin = await read<{commit: string}>('../../../docs/compatibility/reference.json')
const original = freeze(await read<Capture>('./original.json')), corrected = freeze(await read<Capture>('./corrected.json'))
const correction = await read<Record<string, unknown>>('./correction.json'), contract = await read<{cases: number; input_limits: number; controls: number; approved_differences: string[]}>('./contracts.json')
export const {cases} = await read<{cases: Case[]}>('./inputs.json')
const registered = new Map(cases.map(item => [item.name, freeze(structuredClone(item))]))
export const limits = new Map()
const capturedOriginal = new Map(original.cases.map(row => [row.name, row]))
const correctedByName = new Map(corrected.cases.map(row => [row.name, row]))
export const python = new Map(capturedOriginal)
export const originalByName = python
const correctedCases = cases
const hash = (values: unknown) => createHash('sha256').update(JSON.stringify(values)).digest('hex')
export const reference = Object.freeze({reference: pin.commit, suite_sha256: hash(cases)})
assert.equal(original.commit, pin.commit)
assert.equal(corrected.commit, pin.commit)
assert.equal(original.corpus_sha256, hash(cases))
assert.equal(corrected.corpus_sha256, hash(correctedCases))
assert.equal(registered.size, cases.length)
assert.deepEqual(original.cases.map(row => row.name), cases.map(item => item.name))
assert.deepEqual(corrected.cases.map(row => row.name), correctedCases.map(item => item.name))
assert.deepEqual(corrected.collection_correction.excluded_input_limits, [])
assert.equal(corrected.collection_correction.rules_sha256,
  createHash('sha256').update(await readFile(new URL('./rules.py', import.meta.url))).digest('hex'))
assert.equal(corrected.collection_correction.capture_sha256,
  createHash('sha256').update(await readFile(new URL('./capture.py', import.meta.url))).digest('hex'))
for (const [key, value] of Object.entries(correction)) assert.deepEqual(corrected.collection_correction[key], value)
for (const item of cases) {
  assertInputBytes(item, capturedOriginal.get(item.name)!)
  assertInputBytes(item, correctedByName.get(item.name)!)
}
assert.equal(cases.length, contract.cases)
assert.equal(contract.input_limits, 0)
assert.equal(cases.length, 138)
assert.equal(capturedOriginal.size, cases.length)
assert.equal(correctedByName.size, cases.length)
export const approvedDifferences = new Set(contract.approved_differences)
assert.equal(approvedDifferences.size, 41)
const observedDifferences = []
for (const item of correctedCases) {
  const actual = correctedByName.get(item.name)!, previous = capturedOriginal.get(item.name)!
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
assert.equal(contract.controls, 97)
const ordinaryReference = await read<{cases: CaptureRecord[]}>('./ordinary-reference.json')
for (const row of ordinaryReference.cases) {
  assertInputBytes(registered.get(row.name)!, row)
  assertCaptureRecord(capturedOriginal.get(row.name)!, row)
}
assert.equal(ordinaryReference.cases.length, 14)

/** Every registered collection now completes under the exact corrected rules. */
export function assertResult(item: Case, actual: ValidationResult) {
  const expectedInput = registered.get(item.name)!
  assert.ok(expectedInput, 'Unknown collection contract input: ' + item.name)
  assert.deepEqual(item, expectedInput, 'Collection input differs from its immutable registration')
  assert.equal(JSON.stringify(item), JSON.stringify(expectedInput), 'Collection context/member order differs')
  assertInputBytes(item, capturedOriginal.get(item.name)!)
  compareResult(actual, correctedByName.get(item.name)!, item.name)
}
