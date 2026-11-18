import {registeredInputGuard} from '../runtime/input-ownership.mjs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {compareResult} from '../../parity/compare.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'
import type {ReferenceCase, ReferenceExpected} from '../../parity/reference-fixtures.js'
import type {ValidationResult} from '../../../packages/validator/src/index.js'

type Case = ReferenceCase & {contexts?: Record<string, unknown>}
type Capture = {commit: string; corpus_sha256: string; cases: ReferenceExpected[]; [key: string]: unknown}
const read = async <T,>(name: string): Promise<T> => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8')) as T
export const {cases} = await read<{cases: Case[]}>('inputs.json')
const assertRegisteredInput = registeredInputGuard(cases)
const capturedReference = await read<Capture>('python.json')
export const reference = structuredClone(capturedReference)
const pin = await read<{commit: string}>('../../../docs/compatibility/reference.json')
assert.equal(capturedReference.commit, pin.commit)
assert.equal(capturedReference.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
assert.deepEqual(capturedReference.cases.map(row => row.name), cases.map(item => item.name))
const records = new Map(capturedReference.cases.map(row => [row.name, structuredClone(row)]))
for (const item of cases) assertInputBytes(item, records.get(item.name)!)
export const approvedDifferences = new Set<string>()
export const rejected = new Set(cases.filter(item => records.get(item.name)!.status === 'invalid').map(item => item.name))
assert.equal(cases.length, 12)
export function assertResult(item: Case, result: ValidationResult) {
  assertRegisteredInput(item)
  compareResult(result, records.get(item.name)!, item.name)
}
export const originalByName = structuredClone(records)
export const expectedByName = structuredClone(records)
