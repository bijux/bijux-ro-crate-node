import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {compareResult} from '../../parity/compare.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url)))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const freeze = value => {
  if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value)}
  return value
}
const registeredCases = freeze(read('inputs.json').cases)
const specifications = freeze(read('contract.json'))
const original = freeze(read('original.json'))
const corrected = freeze(read('corrected.json'))
const counterparts = freeze(read('counterparts.json'))
const counterpartInputs = freeze(read('propagation-counterparts.json').cases)
const registered = new Map(registeredCases.map(item => [item.name, item]))
const specification = new Map(specifications.cases.map(item => [item.name, item]))
const originals = new Map(original.cases.map(item => [item.name, item]))
const expectations = new Map([...corrected.cases, ...counterparts.cases].map(item => [item.name, item]))
for (const collection of [registered, specification, originals, expectations]) assert.equal(collection.size, 80)
assert.equal(corrected.cases.length, 72)
assert.equal(counterparts.cases.length, 8)
assert.deepEqual(original.cases.map(item => item.name), registeredCases.map(item => item.name))
assert.deepEqual(specifications.cases.map(item => item.name), registeredCases.map(item => item.name))
assert.deepEqual(corrected.cases.map(item => item.name), registeredCases.filter(item => specification.get(item.name).mode === 'processing').map(item => item.name))
assert.deepEqual(counterparts.cases.map(item => item.name), counterpartInputs.map(item => item.name))
assert.equal(specifications.inputs_sha256, digest(readFileSync(new URL('inputs.json', import.meta.url))))
assert.equal(specifications.suite_sha256, digest(JSON.stringify(registeredCases)))
assert.equal(specifications.documents_sha256, digest(readFileSync(new URL('documents.json', import.meta.url))))
assert.equal(specifications.counterparts_sha256, digest(readFileSync(new URL('propagation-counterparts.json', import.meta.url))))
for (const record of [original, corrected, counterparts]) assert.equal(record.commit, specifications.reference)
assert.deepEqual(corrected.jsonld_graph_correction.reference, read('correction.json').reference)
for (const filename of ['direct.json', 'propagation-proof.json'])
  assert.deepEqual(read(filename).reference, read('correction.json').reference, 'Stale JSON-LD primitive source identity: ' + filename)
assert.equal(corrected.jsonld_graph_correction.language_grammar_sha256, digest(readFileSync(new URL('language.py', import.meta.url))))
assert.equal(read('correction.json').language_grammar_sha256, corrected.jsonld_graph_correction.language_grammar_sha256)
for (const [key, filename] of [['capture_sha256', 'capture.py'], ['correction_sha256', 'corrected.py'], ['inputs_sha256', 'inputs.json']])
  assert.equal(corrected.jsonld_graph_correction[key], digest(readFileSync(new URL(filename, import.meta.url))))
const approved = new Set(specifications.cases.filter(item => item.approved_difference).map(item => item.name))
assert.equal(approved.size, 72)
const observed = []
for (const item of registeredCases) {
  assertInputBytes(item, originals.get(item.name))
  const spec = specification.get(item.name), expected = expectations.get(item.name)
  if (spec.mode === 'processing') assertInputBytes(item, expected)
  else {
    const counterpart = counterpartInputs.find(row => row.name === item.name)
    const allowed = structuredClone(item)
    delete allowed.contexts['https://example.org/local-context']['@context']['@propagate']
    assert.deepEqual(counterpart, allowed, 'Propagation counterpart changed more than its declared flag')
    assertInputBytes(counterpart, expected)
  }
  try {compareResult(expected, originals.get(item.name), item.name)} catch {observed.push(item.name)}
  assert.equal(typeof spec.reason === 'string', expected.status === 'incomplete')
}
assert.deepEqual(observed, [...approved], 'Captured differences must match the explicit declaration')

export const cases = structuredClone(registeredCases)
export const originalByName = new Map(structuredClone([...originals]))
export const python = originalByName
export const referenceByName = new Map(structuredClone([...expectations]))
export const approvedDifferences = new Set(approved)
export const reference = Object.freeze({reference: specifications.reference, suite_sha256: specifications.suite_sha256})

/** Bind every result to the complete immutable input, contexts and declared outcome. */
export function assertResult(item, result) {
  const registeredInput = registered.get(item?.name)
  assert.ok(registeredInput, 'Unregistered JSON-LD processing input')
  assert.deepEqual(item, registeredInput, 'Registered JSON-LD processing bytes or contexts changed')
  assertInputBytes(item, originals.get(item.name))
  compareResult(result, expectations.get(item.name), item.name)
  assert.equal(result.reason, specification.get(item.name).reason, 'Unexpected processing interruption')
}
