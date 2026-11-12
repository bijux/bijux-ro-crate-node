import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {compareResult} from '../../parity/compare.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {registeredInputGuard} from '../runtime/input-ownership.mjs'
const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)))
const hash = value => createHash('sha256').update(value).digest('hex')
const freeze = value => {
  if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value)}
  return value
}
const registered = (await read('./inputs.json')).cases
const assertRegistered = registeredInputGuard(registered)
const original = freeze(await read('./original.json'))
const records = new Map(structuredClone(original.cases).map(row => [row.name, row]))
const pin = await read('../../../docs/compatibility/reference.json')
assert.equal(original.commit, pin.commit)
assert.equal(original.corpus_sha256, hash(JSON.stringify(registered)))
assert.deepEqual(original.cases.map(row => row.name), registered.map(row => row.name))
assert.equal(registered.length, 20)
assert.deepEqual(original.cases.reduce((out, row) => (out[row.status]++, out), {valid: 0, invalid: 0, incomplete: 0}),
  {valid: 5, invalid: 15, incomplete: 0})
for (const item of registered) assertInputBytes(item, records.get(item.name))
export const cases = structuredClone(registered)
export const originalByName = structuredClone(records)
export const approvedDifferences = new Set()
export const reference = Object.freeze({reference: pin.commit, suite_sha256: hash(JSON.stringify(registered))})
export function assertCapture(value, mode) {
  assert.equal(mode, 'original')
  assert.deepEqual(value, original)
}
export function assertResult(item, actual) {
  assertRegistered(item)
  assert.deepEqual(Object.keys(actual).sort(), ['report', 'status'])
  compareResult(actual, records.get(item.name), item.name)
}
