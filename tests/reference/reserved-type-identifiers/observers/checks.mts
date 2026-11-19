import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash, type BinaryLike} from 'node:crypto'
import {compareResult} from '../../../parity/compare.mjs'
import {assertInputBytes} from '../../../parity/inputs.mjs'
import type {ReferenceCase, ReferenceExpected} from '../../../parity/reference-fixtures.js'

type Case = ReferenceCase & {contexts?: Record<string, unknown>}
type Observation = {name: string; role: string; counterpart_sha256: string}
type Correction = {reference: {functions: Record<string, string>}; inputs_sha256: string; observations: Observation[]}
type CaptureCase = ReferenceExpected & {inputs_sha256: Record<string, string>; exception: unknown}
type Capture = {commit: string; corpus_sha256: string; cases: CaptureCase[]; reserved_type_correction?: Correction}
type Corrected = Capture & {reserved_type_correction: Correction}
type Result = Parameters<typeof compareResult>[0] & {reason?: string}
const read = async <T,>(name: string): Promise<T> => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8')) as T
const hash = (value: BinaryLike) => createHash('sha256').update(value).digest('hex')
const freeze = <T,>(value: T): T => {
  if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value)}
  return value
}
const registeredCases = freeze((await read<{cases: Case[]}>('./inputs.json')).cases)
const registered = new Map(registeredCases.map(item => [item.name, item]))
const original = freeze(await read<Capture>('./original.json')), corrected = freeze(await read<Corrected>('./corrected.json'))
const originalMap = new Map(original.cases.map(item => [item.name, item]))
const correctedMap = new Map(corrected.cases.map(item => [item.name, item]))
const correctedNames = new Set(['type-index-observer/map/keyword-future', 'type-index-observer/explicit/keyword-future'])
const pin = await read<{commit: string}>('../../../../docs/compatibility/reference.json')
const source = await read<Omit<Correction, 'observations'>>('./correction.json')
const correction = {...source, observations: corrected.reserved_type_correction.observations,
  capture_sha256: hash(await readFile(new URL('./capture.py', import.meta.url))),
  correction_sha256: hash(await readFile(new URL('./corrected.py', import.meta.url)))}
for (const map of [registered, originalMap, correctedMap]) assert.equal(map.size, 6)
assert.equal(hash(await readFile(new URL('./inputs.json', import.meta.url))), source.inputs_sha256)
export const cases = structuredClone(registeredCases)
export const originalByName = new Map(structuredClone(originalMap))
export const reference = Object.freeze({reference: pin.commit, suite_sha256: hash(JSON.stringify(registeredCases))})
export const approvedDifferences = new Set(correctedNames)
export function assertCapture(value: Capture, mode: string) {
  assert.ok(mode === 'original' || mode === 'corrected')
  const expected = mode === 'corrected' ? corrected : original
  assert.deepEqual(value, expected)
  assert.equal(value.commit, pin.commit)
  assert.equal(value.corpus_sha256, hash(JSON.stringify(registeredCases)))
  assert.deepEqual(value.cases.map(item => item.name), registeredCases.map(item => item.name))
  for (const [index,item] of registeredCases.entries()) assertInputBytes(item,value.cases[index])
  if (mode === 'corrected') assert.deepEqual(value.reserved_type_correction, correction)
}
assertCapture(original, 'original'); assertCapture(corrected, 'corrected')
const {reserved_type_correction: _stamp, cases: _fixedCases, ...fixedMetadata} = corrected
const {cases: _oldCases, ...oldMetadata} = original
assert.deepEqual(fixedMetadata, oldMetadata)
assert.deepEqual(correction.observations.map(row => [row.name, row.role]), [...correctedNames].flatMap(name =>
  [[name, 'metadata reference graph'], [name, 'profile data graph']]))
for (const [index,item] of registeredCases.entries()) {
  const before=original.cases[index], after=corrected.cases[index]
  assert.equal(before.status, 'invalid'); assert.equal(after.status, 'invalid')
  if (correctedNames.has(item.name)) assert.notDeepEqual(before.report, after.report)
  else assert.deepEqual(before, after)
}
export function assertResult(item: Case, actual: Result) {
  assert.ok(registered.has(item.name), 'Unregistered reserved-type observer')
  assert.deepEqual(item, registered.get(item.name))
  assert.equal(JSON.stringify(item), JSON.stringify(registered.get(item.name)))
  assertInputBytes(item, originalMap.get(item.name)!)
  assert.deepEqual(Object.keys(actual).sort(), ['report', 'status'])
  compareResult(actual, correctedMap.get(item.name)!, item.name)
}
