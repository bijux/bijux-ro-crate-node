import {registeredInputGuard} from '../runtime/input-ownership.mjs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {compareResult} from '../../parity/compare.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'
const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)))
export const {cases} = await read('inputs.json')
const assertRegisteredInput = registeredInputGuard(cases)
const capturedReference = await read('python.json')
export const reference = structuredClone(capturedReference)
const pin = await read('../../../docs/compatibility/reference.json')
assert.equal(capturedReference.commit, pin.commit)
assert.equal(capturedReference.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
assert.deepEqual(capturedReference.cases.map(row => row.name), cases.map(item => item.name))
const records = new Map(capturedReference.cases.map(row => [row.name, structuredClone(row)]))
for (const item of cases) assertInputBytes(item, records.get(item.name))
export const approvedDifferences = new Set()
export const rejected = new Set(cases.filter(item => records.get(item.name).status === 'invalid').map(item => item.name))
assert.equal(cases.length, 12)
export function assertResult(item, result) {
  assertRegisteredInput(item)
  compareResult(result, records.get(item.name), item.name)
}
export const originalByName = structuredClone(records)
export const expectedByName = structuredClone(records)
