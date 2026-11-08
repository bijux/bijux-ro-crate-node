import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {assertDiagnosticCorrection} from './correction-bounds.mjs'
import {compareResult} from '../../parity/compare.mjs'

const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)))
export const {cases} = await read('inputs.json')
export const original = await read('expected.json')
export const corrected = await read('corrected.json')
assertDiagnosticCorrection(original, corrected)
const pin = JSON.parse(await readFile(new URL('../../../docs/compatibility/reference.json', import.meta.url)))
for (const record of [original, corrected]) {
  assert.equal(record.commit, pin.commit)
  assert.equal(record.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
  assert.deepEqual(record.cases.map(item => item.name), cases.map(item => item.name))
  for (const item of cases) assertInputBytes(item, record.cases.find(row => row.name === item.name))
}
export const originalByName = new Map(original.cases.map(item => [item.name, item]))
export const correctedByName = new Map(corrected.cases.map(item => [item.name, item]))
/** The correction changes diagnostic text, never the crate's rejection. */
export function assertDiagnosticResult(item, result) {
  const expected = correctedByName.get(item.name)
  assert.equal(expected.status, originalByName.get(item.name).status)
  compareResult(result, expected, item.name)
}
