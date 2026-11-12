import {assertSupplementalQualification} from '../../parity/qualification.mjs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {compareResult} from '../../parity/compare.mjs'
import {registeredInputGuard} from '../runtime/input-ownership.mjs'

const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)))
const inputs = (await read('inputs.json')).cases
const assertRegisteredInput = registeredInputGuard(inputs)
const original = await read('original.json'), corrected = await read('corrected.json')
const pin = await read('../../../docs/compatibility/reference.json')
assertSupplementalQualification(corrected.collection_qualification, inputs, 'tests/reference/temporal-literals/inputs.json')
const ordinary = await read('../../parity/expected/crates.json')
const originals = new Map(original.cases.map(row => [row.name, row]))
const expected = new Map(corrected.cases.map(row => [row.name, row]))
const differences = new Set(inputs.filter(item => !item.name.endsWith('/single-value')).map(item => item.name))
const rejectedNames = new Set(inputs.filter(item => expected.get(item.name)?.status === 'invalid').map(item => item.name))
const hash = createHash('sha256').update(JSON.stringify(inputs)).digest('hex')
assert.equal(inputs.length, 9)
assert.equal(differences.size, 6)
assert.equal(rejectedNames.size, 6)
for (const capture of [original, corrected]) {
  assert.equal(capture.commit, pin.commit)
  assert.equal(capture.python, pin.python)
  assert.deepEqual(capture.versions, ordinary.versions)
  assert.equal(capture.context_sha256, createHash('sha256').update(await readFile(new URL('../../parity/context.json', import.meta.url))).digest('hex'))
  assert.equal(capture.corpus_sha256, hash)
  assert.deepEqual(capture.cases.map(row => row.name), inputs.map(item => item.name))
}
const sourceHash = async name => createHash('sha256').update(await readFile(new URL(name, import.meta.url))).digest('hex')
assert.deepEqual(corrected.temporal_correction, {
  rdflib: '7.6.0', owlrl: '7.1.4',
  xsd_datetime_sha256: '88f5fe16466721f72618e981001a33d3108e574ac3301606da33bcaf8fa80555',
  term_sha256: '564280e97c4e64b5b704bd1fff96ebc374ebd2dcc2df134cda62452a3f83c1db',
  owlrl_restore_sha256: 'bdece9cca3a16b4f9d09dce90584eaf2679e970132b96c747998546ca2e2d62b',
  spellings: {'http://www.w3.org/2001/XMLSchema#time': ['03:04:05\u0000', '20250102'],
    'http://www.w3.org/2001/XMLSchema#dateTime': ['2025-01-02T03:04:05\u0000']},
  rules_sha256: await sourceHash('rules.py'), capture_sha256: await sourceHash('capture.py'),
})
for (const item of inputs) {
  const source = originals.get(item.name), target = expected.get(item.name)
  assertInputBytes(item, source)
  assertInputBytes(item, target)
  if (!differences.has(item.name)) assert.deepEqual(source, target)
  else {
    assert.equal(source.status, 'valid')
    assert.equal(target.status, 'invalid')
  }
}

export const cases = structuredClone(inputs)
export const originalByName = structuredClone(originals)
export const approvedDifferences = new Set(differences)
export const rejected = new Set(rejectedNames)
export const reference = Object.freeze({reference: pin.commit, suite_sha256: hash})

/** Only registered spellings use the independently corrected Python reports. */
export function assertResult(item, result) {
  assertRegisteredInput(item)
  assertInputBytes(item, originals.get(item.name))
  compareResult(result, expected.get(item.name), item.name)
  if (differences.has(item.name))
    assert.throws(() => compareResult(result, originals.get(item.name), item.name), /Completion status differs/)
}
