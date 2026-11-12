import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {validateCrate} from '../../src/index.js'
import {cases, assertResult, assertCapture, originalByName, approvedDifferences} from '../../../../tests/reference/model-type-prefixes/checks.mjs'

const folder = new URL('../../../../tests/reference/model-type-prefixes/', import.meta.url)
const original = JSON.parse(await readFile(new URL('original.json', folder)))
const registered = structuredClone(cases), results = new Map()
for (const item of registered) results.set(item.name, await validateCrate(new Map(Object.entries(item.files)),
  {contexts: new Map(Object.entries(item.contexts ?? {}))}))
for (const item of registered) test(item.name + ' retains its unchanged-main outcome', () => assertResult(item, results.get(item.name)))

test('model-type prefix contracts refuse changed input bytes, contexts and results', () => {
  let rejected = 0
  for (const item of registered) {
    for (const mutate of [value => value.name += '-unknown', value => value.files['ro-crate-metadata.json'] += ' ',
      value => value.files.extra = 'extra', value => value.contexts = {'https://example.org/other': {'@context': {}}}]) {
      const value = structuredClone(item); mutate(value)
      assert.throws(() => assertResult(value, results.get(item.name))); rejected++
    }
    for (const mutate of [value => value.status = value.status === 'valid' ? 'invalid' : 'valid',
      value => value.report.highest_error_level = value.report.highest_error_level === null ? 'ERROR' : null,
      value => value.report.issues.INFO.push({message: 'extra', severity: 20, location_description: null})]) {
      const value = structuredClone(results.get(item.name)); mutate(value)
      assert.throws(() => assertResult(item, value)); rejected++
    }
  }
  assert.equal(rejected, 140)
  for (const item of registered.filter(row => row.name.includes('/unflattened-map/'))) for (const field of ['stage', 'reason']) {
    const value = structuredClone(results.get(item.name)); value[field] = 'other'
    assert.throws(() => assertResult(item, value))
  }
})

test('model-type capture contracts bind every unchanged-main report and original byte', async () => {
  assert.equal(approvedDifferences.size, 0)
  assertCapture(original, 'original')
  assert.throws(() => assertCapture(original, 'corrected'))
  for (const mutate of [value => value.cases.pop(), value => value.cases[0].name += '-unknown',
    value => value.cases[0].inputs_sha256['ro-crate-metadata.json'] = '0'.repeat(64),
    value => value.cases[0].report.issues.ERROR.pop(), value => value.cases[0].exception = null,
    value => value.commit = '0'.repeat(40)]) {
    const value = structuredClone(original); mutate(value)
    assert.throws(() => assertCapture(value, 'original'))
  }
  const proof = JSON.parse(await readFile(new URL('proof.json', folder)))
  assert.equal(proof.proof_source_sha256, createHash('sha256').update(await readFile(new URL('prove.py', folder))).digest('hex'))
  assert.equal(proof.pairs.length, 5)
  for (const pair of proof.pairs) {
    assert.equal(pair.projected_models.length, 2)
    assert.deepEqual(pair.projected_models, pair.full_context_models)
  }
})

test('exported model-type data and assertion errors cannot rewrite private reference contracts', () => {
  const saved = cases[0].files['ro-crate-metadata.json'], before = originalByName.get(registered[0].name)
  try {
    cases[0].files['ro-crate-metadata.json'] += ' '
    assert.throws(() => assertResult(cases[0], results.get(registered[0].name)))
    originalByName.set(registered[0].name, {status: 'valid'}); approvedDifferences.add(registered[0].name)
    assertResult(registered[0], results.get(registered[0].name)); assertCapture(original, 'original')
    const changed = structuredClone(original); changed.cases.pop()
    let exposed
    try {assertCapture(changed, 'original')} catch (error) {exposed = error.expected}
    assert.ok(exposed)
    assert.throws(() => exposed.cases.pop(), TypeError)
    assertCapture(original, 'original')
  } finally {
    cases[0].files['ro-crate-metadata.json'] = saved; originalByName.set(registered[0].name, before); approvedDifferences.clear()
  }
})
