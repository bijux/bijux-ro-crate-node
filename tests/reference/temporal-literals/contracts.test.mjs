import assert from 'node:assert/strict'
import {test} from 'node:test'
import {validateCrate} from '../../../packages/validator/src/index.js'
import * as contract from './checks.mjs'

const inputs = structuredClone(contract.cases)
const results = new Map()
for (const item of inputs) results.set(item.name, await validateCrate(new Map(Object.entries(item.files)),
  {contexts: new Map(Object.entries(item.contexts ?? {}))}))

test('all temporal controls compare complete independently captured reports', () => {
  for (const item of inputs) contract.assertResult(item, results.get(item.name))
})

test('temporal contracts refuse changed bytes, contexts, options, names and member order', () => {
  const item = inputs[0], result = results.get(item.name)
  for (const mutation of [
    value => {value.files['ro-crate-metadata.json'] += ' '},
    value => {value.contexts = {'https://example.org/context': {'@context': {}}}},
    value => {value.options = {maxTriples: 1}},
    value => {value.name += '/unregistered'},
  ]) {
    const changed = structuredClone(item)
    mutation(changed)
    assert.throws(() => contract.assertResult(changed, result))
  }
  assert.throws(() => contract.assertResult(Object.fromEntries(Object.entries(item).reverse()), result))
})

test('temporal public captures and classifications cannot replace private authority', () => {
  const cases = structuredClone(contract.cases)
  const originals = structuredClone(contract.originalByName)
  const differences = new Set(contract.approvedDifferences), rejected = new Set(contract.rejected)
  try {
    contract.cases[0].files['ro-crate-metadata.json'] += ' '
    for (const row of contract.originalByName.values()) row.status = 'invalid'
    contract.approvedDifferences.clear()
    contract.rejected.clear()
    for (const item of inputs) contract.assertResult(item, results.get(item.name))
    const difference = inputs.find(item => differences.has(item.name))
    const forged = structuredClone(results.get(difference.name))
    forged.status = 'valid'
    assert.throws(() => contract.assertResult(difference, forged))
  } finally {
    contract.cases.splice(0, contract.cases.length, ...cases)
    contract.originalByName.clear()
    for (const [name, row] of originals) contract.originalByName.set(name, row)
    for (const name of differences) contract.approvedDifferences.add(name)
    for (const name of rejected) contract.rejected.add(name)
  }
})

test('temporal failures require complete findings and intentional completion status', () => {
  for (const item of inputs.filter(item => contract.rejected.has(item.name))) {
    const result = structuredClone(results.get(item.name))
    result.report.issues.ERROR = []
    assert.throws(() => contract.assertResult(item, result))
    const interrupted = {...results.get(item.name), status: 'incomplete', reason: 'Unexpected parser failure'}
    assert.throws(() => contract.assertResult(item, interrupted))
  }
})
