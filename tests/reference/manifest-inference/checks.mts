import assert from 'node:assert/strict'
import {createHash, type BinaryLike} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {compareResult} from '../../parity/compare.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {registeredInputGuard} from '../runtime/input-ownership.mjs'

import type {ReferenceCase, ReferenceExpected} from '../../parity/reference-fixtures.js'
import type {ValidationResult} from '../../../packages/validator/src/index.js'

type ManifestCase = ReferenceCase & {contexts?: Record<string, unknown>}
type Capture = {commit: string; python: string; corpus_sha256: string; context_sha256: string; versions: unknown; cases: Array<ReferenceExpected & {inputs_sha256: Record<string, string>; exception?: unknown}>; manifest_correction?: unknown}
type Contract = {approved_differences: string[]; cases: number; controls: number; valid: number; invalid: number}
type Proof = {inputs_sha256: string; proof_sha256: string; correction: {rules_sha256: string; sentinel_tsv_sha256: string[]; warning_tsv_sha256: string; [key: string]: unknown}; minimum_is_lexical_na: boolean; minimum_changes: Array<{name: string}>; warning: {name: string}}
const read = <T,>(name: string): Promise<T> => readFile(new URL(name, import.meta.url), 'utf8').then(JSON.parse)
const hash = (bytes: BinaryLike) => createHash('sha256').update(bytes).digest('hex')
const freeze = <T,>(value: T): T => {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
const input = await read<{cases: ManifestCase[]}>('inputs.json'), guardInput = registeredInputGuard(input.cases)
export const cases = structuredClone(input.cases)
const original = freeze(await read<Capture>('original.json')), corrected = freeze(await read<Capture>('corrected.json'))
const contract = freeze(await read<Contract>('contract.json')), proof = freeze(await read<Proof>('mechanisms.json'))
const pin = await read<{commit: string; python: string}>('../../../docs/compatibility/reference.json')
const suiteHash = hash(JSON.stringify(input.cases))
const originals = new Map(original.cases.map(row => [row.name, row]))
const expected = new Map(corrected.cases.map(row => [row.name, row]))
const differences = new Set(contract.approved_differences)
export const originalByName = new Map(original.cases.map(row => [row.name, structuredClone(row)]))
export const correctedByName = new Map(corrected.cases.map(row => [row.name, structuredClone(row)]))
export const approvedDifferences = new Set(differences)
export const rejected = new Set()
export const reference = Object.freeze({reference: pin.commit, suite_sha256: suiteHash})
for (const capture of [original, corrected]) {
  assert.equal(capture.commit, pin.commit)
  assert.equal(capture.python, pin.python)
  assert.equal(capture.corpus_sha256, suiteHash)
  assert.deepEqual(capture.cases.map(row => row.name), input.cases.map(item => item.name))
}
assert.deepEqual(corrected.versions, original.versions)
assert.equal(corrected.context_sha256, original.context_sha256)
assert.equal(original.context_sha256, hash(await readFile(new URL('../../parity/context.json', import.meta.url))))
assert.equal(proof.inputs_sha256, hash(await readFile(new URL('inputs.json', import.meta.url))))
assert.equal(proof.proof_sha256, hash(await readFile(new URL('prove-mechanisms.py', import.meta.url))))
assert.deepEqual(corrected.manifest_correction, {...proof.correction,
  capture_sha256: hash(await readFile(new URL('capture.py', import.meta.url)))})
assert.equal(proof.correction.rules_sha256, hash(await readFile(new URL('rules.py', import.meta.url))))
assert.equal(proof.minimum_is_lexical_na, false)
assert.equal(proof.minimum_changes.length, 2)
const minimumNames = new Set(proof.minimum_changes.map(row => row.name))
assert.deepEqual([...minimumNames].map(name => originals.get(name)!.inputs_sha256['file_list.tsv']).sort(),
  proof.correction.sentinel_tsv_sha256)
assert.equal(originals.get(proof.warning.name)!.inputs_sha256['file_list.tsv'], proof.correction.warning_tsv_sha256)
const observed = []
for (const item of input.cases) {
  const before = originals.get(item.name)!, after = expected.get(item.name)!
  assertInputBytes(item, before)
  assertInputBytes(item, after)
  assert.equal(after.status, 'valid')
  if (minimumNames.has(item.name)) {
    assert.equal(before.status, 'invalid')
    assert.deepEqual(before.report, {highest_error_level: 'ERROR', issues: {CRITICAL: [],
      ERROR: [{message: 'File list contains multiple references to the same file path.',
        severity: 40, location_description: null}], WARNING: [], INFO: [], DEBUG: []}})
  } else if (item.name === proof.warning.name) {
    assert.equal(before.status, 'incomplete')
    assert.deepEqual(before.exception, {type: 'IndexError', message: 'list index out of range'})
  } else assert.deepEqual(after, before, item.name)
  if (differences.has(item.name)) {
    assert.throws(() => compareResult(after, before, item.name), assert.AssertionError)
    assert.deepEqual(after.report, {highest_error_level: null,
      issues: {CRITICAL: [], ERROR: [], WARNING: [], INFO: [], DEBUG: []}})
    observed.push(item.name)
  }
}
assert.deepEqual(observed, contract.approved_differences)
assert.deepEqual([...minimumNames, proof.warning.name], observed)
assert.equal(contract.cases, 9)
assert.equal(cases.length, contract.cases)
assert.equal(contract.controls, cases.length - observed.length)
assert.equal(contract.controls, 6)
assert.equal(contract.valid, 9)
assert.equal(contract.invalid, 0)
assert.equal(differences.size, 3)

/** Exact original bytes use only the complete independently corrected report. */
export function assertResult(item: ReferenceCase, result: ValidationResult | ReferenceExpected) {
  guardInput(item)
  assertInputBytes(item, originals.get(item.name)!)
  assertInputBytes(item, expected.get(item.name)!)
  compareResult(result, expected.get(item.name)!, item.name)
}
