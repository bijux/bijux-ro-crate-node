import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {compareResult} from '../../parity/compare.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'

const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)))
export const {cases} = await read('inputs.json')
export const contract = await read('contract.json')
export const reference = await read('python.json')
const pin = JSON.parse(await readFile(new URL('../../../docs/compatibility/reference.json', import.meta.url)))
export const datasetTargets = new Set(contract.dataset_targets)
export const failOpen = new Set(contract.reference_fail_open)
export const python = new Map(reference.cases.map(row => [row.name, row]))
assert.equal(reference.reference, pin.commit)
assert.equal(reference.reference_tree, pin.tree)
assert.equal(reference.suite_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
assert.equal(cases.length, 14)
assert.equal(python.size, cases.length)
assert.equal(datasetTargets.size, 8)
assert.equal(failOpen.size, 6)
for (const item of cases) {
  assertInputBytes(item, python.get(item.name))
  assert.equal(python.get(item.name).status,
    datasetTargets.has(item.name) && !failOpen.has(item.name) ? 'invalid' : 'valid', item.name)
}

/** Keep required Dataset rejection even where the pinned reference fails open. */
export function assertPolicyResult(item, result) {
  if (datasetTargets.has(item.name)) {
    assert.equal(result.status, 'invalid', item.name)
    assert.ok(result.report.issues.ERROR.some(issue => issue.severity === 40 &&
      issue.message.includes('Less than 1 values on Literal(') &&
      issue.message.includes('sh:inversePath <http://schema.org/hasPart>')), item.name)
  } else {
    assert.equal(result.status, 'valid', item.name)
    assert.deepEqual(result.report.issues.ERROR, [], item.name)
    assert.deepEqual(result.report.issues.CRITICAL, [], item.name)
  }
  if (failOpen.has(item.name)) {
    assert.equal(python.get(item.name).status, 'valid', item.name)
    assert.throws(() => compareResult(result, python.get(item.name), item.name), /Completion status differs/)
  } else compareResult(result, python.get(item.name), item.name)
}
