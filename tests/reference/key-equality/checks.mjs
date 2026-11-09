import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {compareResult} from '../../parity/compare.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {registeredInputGuard} from '../runtime/input-ownership.mjs'

const read = name => readFile(new URL(name, import.meta.url), 'utf8').then(JSON.parse)
const freeze = value => {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
const input = await read('inputs.json')
const guardInput = registeredInputGuard(input.cases)
export const cases = structuredClone(input.cases)
const original = freeze(await read('original.json')), corrected = freeze(await read('corrected.json'))
const contract = freeze(await read('contract.json'))
const pin = await read('../../../docs/compatibility/reference.json')
const primitive = await read('primitive.json')
const hash = value => createHash('sha256').update(value).digest('hex')
const suiteHash = hash(JSON.stringify(input.cases))
const originals = new Map(original.cases.map(row => [row.name, row]))
const expected = new Map(corrected.cases.map(row => [row.name, row]))
const differences = new Set(contract.approved_differences)
const refused = new Set(corrected.cases.filter(row => row.status === 'invalid').map(row => row.name))
export const originalByName = new Map(original.cases.map(row => [row.name, structuredClone(row)]))
export const correctedByName = new Map(corrected.cases.map(row => [row.name, structuredClone(row)]))
export const approvedDifferences = new Set(differences)
export const rejected = new Set(refused)
export const reference = Object.freeze({reference: pin.commit, suite_sha256: suiteHash})
for (const capture of [original, corrected]) {
  assert.equal(capture.commit, pin.commit)
  assert.equal(capture.python, pin.python)
  assert.equal(capture.corpus_sha256, suiteHash)
  assert.deepEqual(capture.cases.map(row => row.name), input.cases.map(item => item.name))
}
assert.deepEqual(corrected.versions, original.versions)
assert.equal(corrected.context_sha256, original.context_sha256)
assert.equal(original.context_sha256, hash(await readFile(new URL('../../parity/context.json', import.meta.url))))
assert.deepEqual(corrected.key_correction, {...primitive.key_correction,
  capture_sha256: hash(await readFile(new URL('capture.py', import.meta.url)))})
assert.equal(corrected.key_correction.rules_sha256, hash(await readFile(new URL('rules.py', import.meta.url))))
assert.equal(primitive.capture_sha256, hash(await readFile(new URL('capture-primitive.py', import.meta.url))))
const observed = []
for (const item of input.cases) {
  const before = originals.get(item.name), after = expected.get(item.name)
  assertInputBytes(item, before)
  assertInputBytes(item, after)
  if (differences.has(item.name)) {
    assert.equal(before.status, 'valid')
    assert.equal(after.status, 'invalid')
    assert.deepEqual(after.report.issues.ERROR, [{message: 'A WebSite MUST have a `name` property',
      severity: 40, location_description: 'At ro-crate object with @id: ./#key-right'}])
    assert.throws(() => compareResult(after, before, item.name), assert.AssertionError)
    observed.push(item.name)
  } else assert.deepEqual(after, before, item.name)
}
assert.deepEqual(observed, contract.approved_differences)
assert.equal(contract.cases, 16)
assert.equal(cases.length, contract.cases)
assert.equal(contract.controls, cases.length - observed.length)
assert.equal(contract.controls, 10)
assert.equal(differences.size, 6)
assert.equal(refused.size, contract.invalid)
assert.equal(refused.size, 10)
assert.equal(cases.length - refused.size, contract.valid)
assert.equal(contract.valid, 6)

/** Only exact registered key inputs use the complete independently corrected report. */
export function assertResult(item, result) {
  guardInput(item)
  assertInputBytes(item, originals.get(item.name))
  assertInputBytes(item, expected.get(item.name))
  compareResult(result, expected.get(item.name), item.name)
}
