import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {compareResult} from '../../parity/compare.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {registeredInputGuard} from '../runtime/input-ownership.mjs'

const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)))
const digest = value => createHash('sha256').update(value).digest('hex')
const inputs = (await read('inputs.json')).cases
const guardInput = registeredInputGuard(inputs)
const original = await read('original.json'), corrected = await read('corrected.json')
const contract = await read('contract.json'), correction = await read('correction.json')
const pin = await read('../../../docs/compatibility/reference.json')
const ordinary = await read('../../parity/expected/crates.json')
const originals = new Map(original.cases.map(row => [row.name, row]))
const expected = new Map(corrected.cases.map(row => [row.name, row]))
const differences = new Set(contract.cases.filter(row => row.approved_difference).map(row => row.name))
const refused = new Set(corrected.cases.filter(row => row.status === 'invalid').map(row => row.name))
const suiteHash = digest(JSON.stringify(inputs))
assert.equal(inputs.length, 12)
assert.equal(differences.size, 6)
assert.equal(refused.size, 12)
assert.equal(contract.reference, pin.commit)
assert.deepEqual(contract.cases.map(row => row.name), inputs.map(item => item.name))
assert.equal(correction.inputs_sha256, digest(await readFile(new URL('inputs.json', import.meta.url))))
for (const capture of [original, corrected]) {
  assert.equal(capture.commit, pin.commit)
  assert.equal(capture.python, pin.python)
  assert.deepEqual(capture.versions, ordinary.versions)
  assert.equal(capture.corpus_sha256, suiteHash)
  assert.equal(capture.context_sha256, digest(await readFile(new URL('../../parity/context.json', import.meta.url))))
  assert.deepEqual(capture.cases.map(row => row.name), inputs.map(item => item.name))
}
const {observations, ...stamp} = corrected.graph_context_correction
assert.deepEqual(stamp, {...correction, capture_sha256: digest(await readFile(new URL('capture.py', import.meta.url)))})
assert.deepEqual(correction.roles, ['metadata_reference', 'profile_graph'])
assert.deepEqual(observations.map(({name, role}) => [name, role]),
  inputs.flatMap(item => correction.roles.map(role => [item.name, role])))
for (const event of observations) {
  assert.ok(Number.isSafeInteger(event.triples) && event.triples > 0)
  assert.ok(Number.isSafeInteger(event.named_graphs) && event.named_graphs >= 0)
}
for (const item of inputs) {
  const before = originals.get(item.name), after = expected.get(item.name)
  assertInputBytes(item, before)
  assertInputBytes(item, after)
  assert.equal(before.status, 'invalid')
  assert.equal(after.status, 'invalid')
  if (differences.has(item.name)) assert.throws(() => compareResult(after, before, item.name), assert.AssertionError)
  else compareResult(after, before, item.name)
}

export const cases = structuredClone(inputs)
export const originalByName = structuredClone(originals)
export const correctedByName = structuredClone(expected)
export const approvedDifferences = new Set(differences)
export const rejected = new Set(refused)
export const reference = Object.freeze({reference: pin.commit, suite_sha256: suiteHash})

/** Only exact registered crates use the independently corrected graph reports. */
export function assertResult(item, result) {
  guardInput(item)
  assertInputBytes(item, originals.get(item.name))
  compareResult(result, expected.get(item.name), item.name)
}
