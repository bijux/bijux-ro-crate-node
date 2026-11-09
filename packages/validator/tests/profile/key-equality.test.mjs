import assert from 'node:assert/strict'
import test from 'node:test'
import {validateCrate} from '../../src/index.js'
import {cases, assertResult, originalByName, correctedByName, approvedDifferences, rejected}
  from '../../../../tests/reference/key-equality/checks.mjs'
import {cases as upstreamCases, assertUpstreamResult}
  from '../../../../tests/reference/upstream-defects/checks.mjs'

for (const item of cases) test('key equality retains complete findings: ' + item.name, async () => {
  const before = structuredClone(item)
  const result = await validateCrate(new Map(Object.entries(item.files)),
    {contexts: new Map(Object.entries(item.contexts ?? {}))})
  assertResult(item, result)
  assertUpstreamResult(item, result)
  assert.deepEqual(item, before)
})

test('key false approvals cannot pass by copying the original Python result', () => {
  for (const item of cases.filter(item => approvedDifferences.has(item.name))) {
    assert.throws(() => assertResult(item, originalByName.get(item.name)))
    assert.throws(() => assertUpstreamResult(item, originalByName.get(item.name)))
  }
})

test('the required defect registry retains every registered key input', () => {
  assert.deepEqual(upstreamCases.filter(item => item.name.startsWith('key-equality/')), cases)
  assert.equal(upstreamCases.length, 93)
})

test('key contracts reject changed registration, bytes, contexts and member order', () => {
  const item = cases[0], result = correctedByName.get(item.name)
  const changed = structuredClone(item)
  changed.files['ro-crate-metadata.json'] += ' '
  assert.throws(() => assertResult(changed, result))
  assert.throws(() => assertResult({...item, name: 'key-equality/unregistered'}, result))
  assert.throws(() => assertResult({...item, contexts: {'https://example.org/context': {'@context': {}}}}, result))
  assert.throws(() => assertResult(Object.fromEntries(Object.entries(item).reverse()), result))
})

test('in-place mutation of an exported key case does not change its registration', () => {
  const item = cases[0], result = correctedByName.get(item.name)
  assert.equal(Object.hasOwn(item, 'contexts'), false)
  try {
    item.contexts = {'https://example.org/context': {'@context': {}}}
    assert.throws(() => assertResult(item, result))
  } finally {delete item.contexts}
  assertResult(item, result)
})

test('exported key report maps and case sets cannot change comparison authority', () => {
  const item = cases[0], original = originalByName.get(item.name), corrected = correctedByName.get(item.name)
  const differences = [...approvedDifferences], refusals = [...rejected]
  try {
    originalByName.set(item.name, structuredClone(corrected))
    correctedByName.set(item.name, structuredClone(original))
    approvedDifferences.clear(); rejected.clear()
    assertResult(item, corrected)
    assert.throws(() => assertResult(item, original))
  } finally {
    originalByName.set(item.name, original); correctedByName.set(item.name, corrected)
    for (const name of differences) approvedDifferences.add(name)
    for (const name of refusals) rejected.add(name)
  }
})

test('key contracts retain exact severity, focus and finding counts', () => {
  const item = cases[0]
  for (const mutate of [
    result => {result.report.issues.ERROR = []; result.report.highest_error_level = null},
    result => {result.report.issues.ERROR[0].location_description = 'At ro-crate object with @id: ./#other'},
    result => {result.report.issues.ERROR[0].severity = 30},
    result => {result.report.issues.ERROR.push(structuredClone(result.report.issues.ERROR[0]))},
  ]) {
    const result = structuredClone(correctedByName.get(item.name))
    mutate(result)
    assert.throws(() => assertResult(item, result))
  }
})
