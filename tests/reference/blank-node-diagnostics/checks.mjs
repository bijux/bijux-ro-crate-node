import {registeredInputGuard} from '../runtime/input-ownership.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {assertDiagnosticCorrection} from './correction-bounds.mjs'
import {compareResult} from '../../parity/compare.mjs'

const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)))
export const {cases} = await read('inputs.json')
const assertRegisteredInput = registeredInputGuard(cases)
const capturedOriginal = await read('expected.json')
const capturedCorrected = await read('corrected.json')
assertDiagnosticCorrection(capturedOriginal, capturedCorrected)
const pin = JSON.parse(await readFile(new URL('../../../docs/compatibility/reference.json', import.meta.url)))
for (const record of [capturedOriginal, capturedCorrected]) {
  assert.equal(record.commit, pin.commit)
  assert.equal(record.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
  assert.deepEqual(record.cases.map(item => item.name), cases.map(item => item.name))
  for (const item of cases) assertInputBytes(item, record.cases.find(row => row.name === item.name))
}
const originalRecords = new Map(capturedOriginal.cases.map(item => [item.name, item]))
const correctedRecords = new Map(capturedCorrected.cases.map(item => [item.name, item]))
/** The correction changes diagnostic text, never the crate's rejection. */
export function assertDiagnosticResult(item, result) {
  assertRegisteredInput(item)
  const expected = correctedRecords.get(item.name)
  assert.equal(expected.status, originalRecords.get(item.name).status)
  compareResult(result, expected, item.name)
}

// Inspection snapshots cannot change the private comparison records.
export const original = structuredClone(capturedOriginal)
export const corrected = structuredClone(capturedCorrected)
export const originalByName = structuredClone(originalRecords)
export const correctedByName = structuredClone(correctedRecords)
