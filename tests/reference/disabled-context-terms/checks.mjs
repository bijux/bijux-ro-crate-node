import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {compareResult} from '../../parity/compare.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'

const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)))
export const {cases} = await read('inputs.json')
const capturedReference = await read('python.json')
// Inspection snapshots cannot change the private comparison records.
export const reference = structuredClone(capturedReference)
export const {counterparts} = await read('contract.json')
const pin = await read('../../../docs/compatibility/reference.json')
assert.equal(capturedReference.commit, pin.commit)
assert.equal(capturedReference.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
assert.deepEqual(capturedReference.cases.map(row => row.name), cases.map(item => item.name))
const capturedOriginal = new Map(capturedReference.cases.map(row => [row.name, row]))
export const approvedDifferences = new Set(Object.keys(counterparts))
for (const item of cases) {
  assertInputBytes(item, capturedOriginal.get(item.name))
  if (approvedDifferences.has(item.name)) {
    assert.equal(capturedOriginal.get(item.name).status, 'incomplete')
    assert.deepEqual(capturedOriginal.get(item.name).exception,
      {type: 'TypeError', message: "argument of type 'NoneType' is not iterable"})
    assert.ok(capturedOriginal.has(counterparts[item.name]))
  }
}
const expectedRecords = new Map(cases.map(item =>
  [item.name, capturedOriginal.get(counterparts[item.name] ?? item.name)]))
export const rejected = new Set(cases.filter(item => expectedRecords.get(item.name).status === 'invalid').map(item => item.name))
assert.equal(cases.length, 12)
assert.equal(approvedDifferences.size, 7)
assert.equal(rejected.size, 4)

/** Disabled terms use the exact unchanged-Python counterpart report. */
export function assertResult(item, result) {
  compareResult(result, expectedRecords.get(item.name), item.name)
}

export const originalByName = structuredClone(capturedOriginal)
export const expectedByName = structuredClone(expectedRecords)
