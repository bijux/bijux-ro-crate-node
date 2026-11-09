import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {compareResult} from '../../parity/compare.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {correctedConstraintReport} from '../upstream-defects/constraint-report.mjs'

const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)))
export const {cases} = await read('inputs.json')
const policyContract = await read('contract.json')
const capturedReference = await read('python.json')
const pin = JSON.parse(await readFile(new URL('../../../docs/compatibility/reference.json', import.meta.url)))
const declaredTargets = new Set(policyContract.dataset_targets)
const declaredFailOpen = new Set(policyContract.reference_fail_open)
const capturedRecords = new Map(capturedReference.cases.map(row => [row.name, row]))
assert.equal(capturedReference.reference, pin.commit)
assert.equal(capturedReference.reference_tree, pin.tree)
assert.equal(capturedReference.suite_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
assert.equal(cases.length, 14)
assert.equal(capturedRecords.size, cases.length)
assert.equal(declaredTargets.size, 8)
assert.equal(declaredFailOpen.size, 6)
assert.deepEqual(Object.keys(policyContract.corrected_findings).sort(), [...declaredFailOpen].sort())
for (const item of cases) {
  assertInputBytes(item, capturedRecords.get(item.name))
  assert.equal(capturedRecords.get(item.name).status,
    declaredTargets.has(item.name) && !declaredFailOpen.has(item.name) ? 'invalid' : 'valid', item.name)
}

/** Keep required Dataset rejection even where the pinned reference fails open. */
export function assertPolicyResult(item, result) {
  if (declaredTargets.has(item.name)) {
    assert.equal(result.status, 'invalid', item.name)
    assert.ok(result.report.issues.ERROR.some(issue => issue.severity === 40 &&
      issue.message.includes('Less than 1 values on Literal(') &&
      issue.message.includes('sh:inversePath <http://schema.org/hasPart>')), item.name)
  } else {
    assert.equal(result.status, 'valid', item.name)
    assert.deepEqual(result.report.issues.ERROR, [], item.name)
    assert.deepEqual(result.report.issues.CRITICAL, [], item.name)
  }
  if (declaredFailOpen.has(item.name)) {
    assert.equal(capturedRecords.get(item.name).status, 'valid', item.name)
    compareResult(result, {...capturedRecords.get(item.name), status: 'invalid',
      report: correctedConstraintReport(capturedRecords.get(item.name), policyContract.corrected_findings[item.name])}, item.name)
    assert.throws(() => compareResult(result, capturedRecords.get(item.name), item.name), /Completion status differs/)
  } else compareResult(result, capturedRecords.get(item.name), item.name)
}

// Inspection snapshots cannot change the private comparison records.
export const contract = structuredClone(policyContract)
export const reference = structuredClone(capturedReference)
export const python = structuredClone(capturedRecords)
export const datasetTargets = new Set(declaredTargets)
export const failOpen = new Set(declaredFailOpen)
