import {registeredInputGuard} from '../runtime/input-ownership.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {assertDiagnosticCorrection} from './correction-bounds.mjs'
import {compareResult} from '../../parity/compare.mjs'

import type {ReferenceCase} from '../../parity/reference-fixtures.js'
import type {Capture} from './correction-bounds.mjs'
import type {ValidationResult} from '../../../packages/validator/src/index.js'
type Case = ReferenceCase & {contexts?: Record<string, unknown>}
const read = <T,>(name: string): Promise<T> => readFile(new URL(name, import.meta.url), 'utf8').then(JSON.parse)
export const {cases} = await read<{cases: Case[]}>('inputs.json')
const assertRegisteredInput = registeredInputGuard(cases)
const capturedOriginal = await read<Capture>('expected.json')
const capturedCorrected = await read<Capture>('corrected.json')
assertDiagnosticCorrection(capturedOriginal, capturedCorrected)
const pin = await read<{commit: string}>('../../../docs/compatibility/reference.json')
for (const record of [capturedOriginal, capturedCorrected]) {
  assert.equal(record.commit, pin.commit)
  assert.equal(record.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
  assert.deepEqual(record.cases.map(item => item.name), cases.map(item => item.name))
  for (const item of cases) assertInputBytes(item, record.cases.find(row => row.name === item.name)!)
}
const originalRecords = new Map(capturedOriginal.cases.map(item => [item.name, item]))
const correctedRecords = new Map(capturedCorrected.cases.map(item => [item.name, item]))
/** The correction changes diagnostic text, never the crate's rejection. */
export function assertDiagnosticResult(item: Case, result: ValidationResult) {
  assertRegisteredInput(item)
  const expected = correctedRecords.get(item.name)!
  assert.equal(expected.status, originalRecords.get(item.name)!.status)
  compareResult(result, expected, item.name)
}

// Inspection snapshots cannot change the private comparison records.
export const original = structuredClone(capturedOriginal)
export const corrected = structuredClone(capturedCorrected)
export const originalByName = structuredClone(originalRecords)
export const correctedByName = structuredClone(correctedRecords)
