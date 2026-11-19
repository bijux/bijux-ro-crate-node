import {registeredInputGuard} from '../runtime/input-ownership.mjs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {compareResult} from '../../parity/compare.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {correctedConstraintReport} from '../upstream-defects/constraint-report.mjs'

import type {ReferenceCase, ReferenceExpected} from '../../parity/reference-fixtures.js'
import type {ParityIssue} from '../../parity/normalize.mjs'
import type {ValidationResult} from '../../../packages/validator/src/index.js'
type Case = ReferenceCase & {contexts?: Record<string, unknown>}
type Contract = {dataset_targets: string[]; reference_fail_open: string[]; corrected_findings: Record<string, ParityIssue>}
type Capture = {reference: string; reference_tree: string; suite_sha256: string; cases: ReferenceExpected[]}
const read = <T,>(name: string): Promise<T> => readFile(new URL(name, import.meta.url), 'utf8').then(JSON.parse)
export const {cases} = await read<{cases: Case[]}>('inputs.json')
const assertRegisteredInput = registeredInputGuard(cases)
const policyContract = await read<Contract>('contract.json')
const capturedReference = await read<Capture>('python.json')
const pin = await read<{commit: string; tree: string}>('../../../docs/compatibility/reference.json')
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
  assertInputBytes(item, capturedRecords.get(item.name)!)
  assert.equal(capturedRecords.get(item.name)!.status,
    declaredTargets.has(item.name) && !declaredFailOpen.has(item.name) ? 'invalid' : 'valid', item.name)
}

/** Keep required Dataset rejection even where the pinned reference fails open. */
export function assertPolicyResult(item: Case, result: ValidationResult) {
  assertRegisteredInput(item)
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
    assert.equal(capturedRecords.get(item.name)!.status, 'valid', item.name)
    compareResult(result, {...capturedRecords.get(item.name)!, status: 'invalid',
      report: correctedConstraintReport(capturedRecords.get(item.name)!, policyContract.corrected_findings[item.name])}, item.name)
    assert.throws(() => compareResult(result, capturedRecords.get(item.name)!, item.name), /Completion status differs/)
  } else compareResult(result, capturedRecords.get(item.name)!, item.name)
}

// Inspection snapshots cannot change the private comparison records.
export const contract = structuredClone(policyContract)
export const reference = structuredClone(capturedReference)
export const python = structuredClone(capturedRecords)
export const datasetTargets = new Set(declaredTargets)
export const failOpen = new Set(declaredFailOpen)
