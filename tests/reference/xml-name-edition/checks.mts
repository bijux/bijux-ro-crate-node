import {registeredInputGuard} from '../runtime/input-ownership.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {compareResult} from '../../parity/compare.mjs'
import {asciiNameCounterpart} from './names.mjs'
import type {ReferenceCase, ReferenceExpected} from '../../parity/reference-fixtures.js'
import type {ValidationReport} from '../../../packages/validator/src/index.js'

type Case = ReferenceCase & {contexts?: Record<string, unknown>}
type CaptureCase = Omit<ReferenceExpected, 'status' | 'report'> & {status: string; report: ValidationReport}
type Pair = {name: string; character: string | null; codepoint: number; role: string; first: string; second: string}
type Contract = {counterparts: Record<string, string>; pairs: Pair[]; ascii_name: string}
type Capture = {commit: string; corpus_sha256: string; cases: CaptureCase[]}

const read = async <T,>(name: string): Promise<T> => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8')) as T
export const {cases} = await read<{cases: Case[]}>('inputs.json')
const assertRegisteredInput = registeredInputGuard(cases)
const capture = await read<Capture>('python.json'), contract = await read<Contract>('contract.json')
const pin = await read<{commit: string}>('../../../docs/compatibility/reference.json')
assert.equal(capture.commit, pin.commit)
assert.equal(capture.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
assert.deepEqual(capture.cases.map(row => row.name), cases.map(item => item.name))
const capturedOriginal = new Map(capture.cases.map(row => [row.name, row]))
const inputs = new Map(cases.map(item => [item.name, structuredClone(item)]))
const counterpartNames = new Set(Object.keys(contract.counterparts))
const declaredDifferences = new Set([...counterpartNames].filter(name => name.endsWith('/hasvalue')))
const expectedRecords = new Map(cases.map(item => [item.name,
  capturedOriginal.get(contract.counterparts[item.name] ?? item.name)]))
export const rejected = new Set(cases.filter(item => expectedRecords.get(item.name)!.status === 'invalid').map(item => item.name))
export const reference = {reference: pin.commit, suite_sha256: capture.corpus_sha256}
assert.equal(cases.length, 46)
assert.equal(counterpartNames.size, 22)
assert.equal(declaredDifferences.size, 11)
assert.equal(rejected.size, 23)

for (const item of cases) {
  assertInputBytes(item, capturedOriginal.get(item.name)!)
  if (!counterpartNames.has(item.name)) continue
  const pair = contract.pairs.find(pair => item.name.startsWith('xml-name-edition/' + pair.name + '/'))
  assert.ok(pair && pair.character !== null)
  assert.equal(pair.character, String.fromCodePoint(pair.codepoint))
  const counterpart = inputs.get(contract.counterparts[item.name])
  const source = JSON.parse(item.files['ro-crate-metadata.json'])
  const target = JSON.parse(counterpart!.files['ro-crate-metadata.json'])
  const literals: unknown[] = []
  function rename(value: unknown) {
    if (!value || typeof value !== 'object') return
    const node = value as Record<string, unknown>
    if (node['@type'] === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral') {
      literals.push(node['@value'])
      node['@value'] = asciiNameCounterpart(node['@value'] as string, pair as Pair & {character: string}, contract.ascii_name)
    }
    for (const child of Object.values(value)) rename(child)
  }
  rename(source)
  assert.deepEqual(literals, [pair.first, pair.second], item.name)
  // Only the two XML literal spellings may change. Other metadata, contexts,
  // manifests and the complete resulting findings retain strict comparison.
  assert.deepEqual(source, target, item.name)
  const otherFiles = (files: Record<string, string>) => Object.fromEntries(Object.entries(files).filter(([path]) => path !== 'ro-crate-metadata.json'))
  assert.deepEqual(otherFiles(item.files), otherFiles(counterpart!.files), item.name)
  assert.deepEqual(item.contexts ?? {}, counterpart!.contexts ?? {}, item.name)
  if (declaredDifferences.has(item.name))
    assert.notEqual(capturedOriginal.get(item.name)!.status, expectedRecords.get(item.name)!.status, item.name)
  else compareResult(capturedOriginal.get(item.name)!, expectedRecords.get(item.name)!, item.name)
}

/** Fifth-Edition names use the exact unchanged-Python ASCII-name counterpart. */
export function assertResult(item: Case, result: Parameters<typeof compareResult>[0]) {
  assert.ok(inputs.has(item.name), 'Unregistered XML name case: ' + item.name)
  assertInputBytes(item, capturedOriginal.get(item.name)!)
  assertRegisteredInput(item)
  compareResult(result, expectedRecords.get(item.name)!, item.name)
  if (declaredDifferences.has(item.name))
    assert.throws(() => compareResult(result, capturedOriginal.get(item.name)!, item.name), /Completion status differs/)
}

// Inspection snapshots cannot change the private comparison records.
export const originalByName = structuredClone(capturedOriginal)
export const expected = structuredClone(expectedRecords)
export const approvedDifferences = new Set(declaredDifferences)

export const python = originalByName
