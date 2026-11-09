import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {compareResult} from '../../parity/compare.mjs'
import {asciiNameCounterpart} from './names.mjs'

const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)))
export const {cases} = await read('inputs.json')
const capture = await read('python.json'), contract = await read('contract.json')
const pin = await read('../../../docs/compatibility/reference.json')
assert.equal(capture.commit, pin.commit)
assert.equal(capture.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
assert.deepEqual(capture.cases.map(row => row.name), cases.map(item => item.name))
export const originalByName = new Map(capture.cases.map(row => [row.name, row]))
const inputs = new Map(cases.map(item => [item.name, structuredClone(item)]))
export const approvedDifferences = new Set(Object.keys(contract.counterparts))
export const expected = new Map(cases.map(item => [item.name,
  originalByName.get(contract.counterparts[item.name] ?? item.name)]))
export const rejected = new Set(cases.filter(item => expected.get(item.name).status === 'invalid').map(item => item.name))
export const reference = {reference: pin.commit, suite_sha256: capture.corpus_sha256}
assert.equal(cases.length, 46)
assert.equal(approvedDifferences.size, 22)
assert.equal(rejected.size, 23)

for (const item of cases) {
  assertInputBytes(item, originalByName.get(item.name))
  if (!approvedDifferences.has(item.name)) continue
  const pair = contract.pairs.find(pair => item.name.startsWith('xml-name-edition/' + pair.name + '/'))
  assert.ok(pair && pair.character !== null)
  assert.equal(pair.character, String.fromCodePoint(pair.codepoint))
  const counterpart = inputs.get(contract.counterparts[item.name])
  const source = JSON.parse(item.files['ro-crate-metadata.json'])
  const target = JSON.parse(counterpart.files['ro-crate-metadata.json'])
  const literals = []
  function rename(value) {
    if (!value || typeof value !== 'object') return
    if (value['@type'] === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral') {
      literals.push(value['@value'])
      value['@value'] = asciiNameCounterpart(value['@value'], pair, contract.ascii_name)
    }
    for (const child of Object.values(value)) rename(child)
  }
  rename(source)
  assert.deepEqual(literals, [pair.first, pair.second], item.name)
  // Only the two XML literal spellings may change. Other metadata, contexts,
  // manifests and the complete resulting findings retain strict comparison.
  assert.deepEqual(source, target, item.name)
  const otherFiles = files => Object.fromEntries(Object.entries(files).filter(([path]) => path !== 'ro-crate-metadata.json'))
  assert.deepEqual(otherFiles(item.files), otherFiles(counterpart.files), item.name)
  assert.deepEqual(item.contexts ?? {}, counterpart.contexts ?? {}, item.name)
  assert.notEqual(originalByName.get(item.name).status, expected.get(item.name).status, item.name)
}

/** Fifth-Edition names use the exact unchanged-Python ASCII-name counterpart. */
export function assertResult(item, result) {
  assert.ok(inputs.has(item.name), 'Unregistered XML name case: ' + item.name)
  assertInputBytes(item, originalByName.get(item.name))
  assert.deepEqual(item.contexts ?? {}, inputs.get(item.name).contexts ?? {})
  compareResult(result, expected.get(item.name), item.name)
  if (approvedDifferences.has(item.name))
    assert.throws(() => compareResult(result, originalByName.get(item.name), item.name), /Completion status differs/)
}

export const python = originalByName
