import assert from 'node:assert/strict'
import {test} from 'node:test'
import {validateCrate, type ValidationResult} from '../../../packages/validator/src/index.ts'
import * as contract from './checks.mjs'

const inputs = structuredClone(contract.cases)
const results = new Map<string, ValidationResult>()
for (const item of inputs) results.set(item.name, await validateCrate(new Map(Object.entries(item.files)),
  {contexts: new Map(Object.entries(item.contexts ?? {}))}))

function resultFor(name: string): ValidationResult {
  const result = results.get(name)
  assert.ok(result)
  return result
}

test('all graph-context controls compare complete independently captured reports', () => {
  for (const item of inputs) contract.assertResult(item, resultFor(item.name))
})

test('graph-context contracts refuse changed bytes, contexts, options, names and member order', () => {
  const item = inputs[0], result = resultFor(item.name)
  for (const mutation of [
    value => {value.files['ro-crate-metadata.json'] += ' '},
    value => {value.contexts = {'https://example.org/context': {'@context': {}}}},
    value => {value.options = {maxTriples: 1}},
    value => {value.name += '/unregistered'},
  ] satisfies Array<(value: typeof inputs[number] & {options?: unknown}) => void>) {
    const changed = structuredClone(item)
    mutation(changed)
    assert.throws(() => contract.assertResult(changed, result))
  }
  assert.throws(() => contract.assertResult(Object.fromEntries(Object.entries(item).reverse()) as typeof item, result))
})

test('graph-context public captures and classifications cannot replace private authority', () => {
  const cases = structuredClone(contract.cases)
  const originals = structuredClone(contract.originalByName)
  const corrected = structuredClone(contract.correctedByName)
  const differences = new Set(contract.approvedDifferences), rejected = new Set(contract.rejected)
  try {
    contract.cases[0].files['ro-crate-metadata.json'] += ' '
    for (const records of [contract.originalByName, contract.correctedByName])
      for (const row of records.values()) {row.status = 'valid'; row.report.issues.ERROR = []}
    contract.approvedDifferences.clear()
    contract.rejected.clear()
    for (const item of inputs) contract.assertResult(item, resultFor(item.name))
    const difference = inputs.find(item => differences.has(item.name))
    assert.ok(difference)
    const forged = structuredClone(resultFor(difference.name))
    forged.status = 'valid'
    assert.throws(() => contract.assertResult(difference, forged))
  } finally {
    contract.cases.splice(0, contract.cases.length, ...cases)
    contract.originalByName.clear()
    for (const [name, row] of originals) contract.originalByName.set(name, row)
    contract.correctedByName.clear()
    for (const [name, row] of corrected) contract.correctedByName.set(name, row)
    for (const name of differences) contract.approvedDifferences.add(name)
    for (const name of rejected) contract.rejected.add(name)
  }
})

test('graph-context failures require complete findings and intentional completion status', () => {
  for (const item of inputs.filter(item => contract.rejected.has(item.name))) {
    const result = structuredClone(resultFor(item.name))
    result.report.issues.ERROR = []
    assert.throws(() => contract.assertResult(item, result))
    const interrupted = Object.assign({}, resultFor(item.name), {status: 'incomplete', reason: 'Unexpected parser failure'})
    assert.throws(() => contract.assertResult(item, interrupted))
  }
})

test('each diagnostic correction rejects the unchanged Python report', () => {
  for (const item of inputs.filter(item => contract.approvedDifferences.has(item.name))) {
    const original = contract.originalByName.get(item.name)
    assert.ok(original)
    assert.throws(() => contract.assertResult(item, original))
  }
})
