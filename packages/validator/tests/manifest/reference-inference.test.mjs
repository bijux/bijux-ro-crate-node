import assert from 'node:assert/strict'
import test from 'node:test'
import {validateCrate} from '../../src/index.js'
import {cases, assertResult, originalByName, correctedByName, approvedDifferences, rejected}
  from '../../../../tests/reference/manifest-inference/checks.mjs'

for (const item of cases) test('manifest inference retains complete findings: ' + item.name, async () => {
  const before = structuredClone(item)
  assertResult(item, await validateCrate(new Map(Object.entries(item.files))))
  assert.deepEqual(item, before)
})

test('upstream missingness rejections and warning interruptions cannot pass as corrected results', () => {
  for (const item of cases.filter(item => approvedDifferences.has(item.name)))
    assert.throws(() => assertResult(item, originalByName.get(item.name)))
})

test('manifest contracts reject changed bytes, contexts, names and member order', () => {
  const item = cases[0], result = correctedByName.get(item.name)
  const changed = structuredClone(item)
  changed.files['file_list.tsv'] += '\n'
  assert.throws(() => assertResult(changed, result))
  assert.throws(() => assertResult({...item, name: 'manifest-inference/unregistered'}, result))
  assert.throws(() => assertResult({...item, contexts: {'https://example.org/context': {'@context': {}}}}, result))
  assert.throws(() => assertResult(Object.fromEntries(Object.entries(item).reverse()), result))
})

test('mutating an exported manifest case cannot replace its private registration', () => {
  const item = cases[0], result = correctedByName.get(item.name)
  assert.equal(Object.hasOwn(item, 'contexts'), false)
  try {
    item.contexts = {'https://example.org/context': {'@context': {}}}
    assert.throws(() => assertResult(item, result))
  } finally {delete item.contexts}
  assertResult(item, result)
})

test('public manifest reports and difference sets cannot change expected results', () => {
  const item = cases[0], original = originalByName.get(item.name), corrected = correctedByName.get(item.name)
  const differences = [...approvedDifferences]
  try {
    originalByName.set(item.name, structuredClone(corrected))
    correctedByName.set(item.name, structuredClone(original))
    approvedDifferences.clear(); rejected.add(item.name)
    assertResult(item, corrected)
    assert.throws(() => assertResult(item, original))
  } finally {
    originalByName.set(item.name, original); correctedByName.set(item.name, corrected)
    for (const name of differences) approvedDifferences.add(name)
    rejected.clear()
  }
})

test('corrected manifest reports reject invented diagnostics and interruptions', () => {
  const item = cases[0]
  const changed = structuredClone(correctedByName.get(item.name))
  changed.status = 'incomplete'
  assert.throws(() => assertResult(item, changed))
  changed.status = 'valid'
  changed.report.highest_error_level = 'ERROR'
  changed.report.issues.ERROR.push({message: 'Invented finding', severity: 40, location_description: null})
  assert.throws(() => assertResult(item, changed))
})
