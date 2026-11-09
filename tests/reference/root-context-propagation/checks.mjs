import {registeredInputGuard} from '../runtime/input-ownership.mjs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {compareResult} from '../../parity/compare.mjs'

const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)))
export const {cases} = await read('inputs.json')
const assertRegisteredInput = registeredInputGuard(cases)
const capture = await read('python.json')
const contract = await read('contract.json')
const graphs = await read('graphs.json')
const pin = JSON.parse(await readFile(new URL('../../../docs/compatibility/reference.json', import.meta.url)))
const capturedOriginal = new Map(capture.cases.map(row => [row.name, row]))
const declaredDifferences = new Set(Object.keys(contract.counterparts))
const expectedRecords = new Map(cases.map(item => [item.name,
  capturedOriginal.get(contract.counterparts[item.name] ?? item.name)]))
assert.equal(cases.length, 15)
assert.equal(capturedOriginal.size, cases.length)
assert.equal(declaredDifferences.size, 9)
assert.equal(capture.commit, pin.commit)
assert.equal(graphs.reference, pin.commit)
assert.equal(capture.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
assert.equal(graphs.crate_inputs_sha256, createHash('sha256')
  .update(await readFile(new URL('inputs.json', import.meta.url))).digest('hex'))
assert.deepEqual(capture.cases.map(row => row.name), cases.map(item => item.name))
assert.deepEqual(graphs.crate_graphs.map(row => row.name), cases.map(item => item.name))
assert.deepEqual(Object.keys(graphs.reference_graphs).sort(),
  [...new Set(graphs.crate_graphs.map(row => row.counterpart))].sort())
for (const item of cases) {
  const counterpart = cases.find(value => value.name === (contract.counterparts[item.name] ?? item.name))
  const originalDocument = JSON.parse(item.files['ro-crate-metadata.json'])
  const counterpartDocument = JSON.parse(counterpart.files['ro-crate-metadata.json'])
  delete originalDocument['@context']
  delete counterpartDocument['@context']
  if (contract.counterpart_child_context_resets.includes(item.name)) {
    for (const node of counterpartDocument['@graph']) {
      assert.equal(node['@context'], null)
      delete node['@context']
    }
  }
  assert.deepEqual(counterpartDocument, originalDocument, 'Counterparts changed metadata values: ' + item.name)
  const otherFiles = files => Object.fromEntries(Object.entries(files).filter(([name]) => name !== 'ro-crate-metadata.json'))
  assert.deepEqual(otherFiles(counterpart.files), otherFiles(item.files))
  assertInputBytes(item, capturedOriginal.get(item.name))
  const graph = graphs.crate_graphs.find(row => row.name === item.name)
  assert.equal(graph.counterpart, contract.counterparts[item.name] ?? item.name)
  assert.equal(graph.standard_graphs_equivalent, true)
  assert.ok(['valid', 'invalid'].includes(expectedRecords.get(item.name)?.status), item.name)
  if (declaredDifferences.has(item.name)) {
    assert.equal(capturedOriginal.get(item.name).status, 'incomplete')
    assert.equal(capturedOriginal.get(item.name).exception.message, "'NoneType' object has no attribute 'get_id'")
  }
}
export const rejected = new Set(cases.filter(item => expectedRecords.get(item.name).status === 'invalid').map(item => item.name))
export const reference = {reference: pin.commit, suite_sha256: capture.corpus_sha256}

/** Compare every finding exactly against its independently equivalent Python input. */
export function assertRootPropagationResult(item, result) {
  assertRegisteredInput(item)
  assert.ok(expectedRecords.has(item.name), 'Unregistered root context case: ' + item.name)
  compareResult(result, expectedRecords.get(item.name), item.name)
  if (declaredDifferences.has(item.name))
    assert.throws(() => compareResult(result, capturedOriginal.get(item.name), item.name), /Completion status differs/)
}

export const assertResult = assertRootPropagationResult

// Inspection snapshots cannot change the private comparison records.
export const python = structuredClone(capturedOriginal)
export const expected = structuredClone(expectedRecords)
export const approvedDifferences = new Set(declaredDifferences)

export const originalByName = python
