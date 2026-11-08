import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {compareResult} from '../../parity/compare.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'

const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)))
export const {cases} = await read('inputs.json')
export const reference = await read('python.json')
export const {counterparts} = await read('contract.json')
const pin = await read('../../../docs/compatibility/reference.json')
assert.equal(reference.commit, pin.commit)
assert.equal(reference.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
assert.deepEqual(reference.cases.map(row => row.name), cases.map(item => item.name))
export const originalByName = new Map(reference.cases.map(row => [row.name, row]))
export const approvedDifferences = new Set(Object.keys(counterparts))
for (const item of cases) {
  assertInputBytes(item, originalByName.get(item.name))
  if (approvedDifferences.has(item.name)) {
    assert.equal(originalByName.get(item.name).status, 'incomplete')
    assert.deepEqual(originalByName.get(item.name).exception,
      {type: 'TypeError', message: "argument of type 'NoneType' is not iterable"})
    assert.ok(originalByName.has(counterparts[item.name]))
  }
}
export const expectedByName = new Map(cases.map(item =>
  [item.name, originalByName.get(counterparts[item.name] ?? item.name)]))
export const rejected = new Set(cases.filter(item => expectedByName.get(item.name).status === 'invalid').map(item => item.name))
assert.equal(cases.length, 12)
assert.equal(approvedDifferences.size, 7)
assert.equal(rejected.size, 4)

/** Disabled terms use the exact unchanged-Python counterpart report. */
export function assertResult(item, result) {
  compareResult(result, expectedByName.get(item.name), item.name)
}
