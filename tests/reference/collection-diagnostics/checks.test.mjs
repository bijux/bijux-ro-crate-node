import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {cases, assertResult, assertCaptureBounds, originalByName} from './checks.mjs'
const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)))
const original = await read('./original.json'), corrected = await read('./corrected.json')

test('recursive diagnostics reject unrelated outcome, finding and provenance changes', () => {
  assertCaptureBounds(original, corrected)
  for (const mutate of [
    row => {row.cases[0].name += '-unregistered'},
    row => {row.cases[0].status = 'valid'},
    row => {row.cases[0].report.issues.ERROR = []},
    row => {row.cases[0].report.issues.ERROR[0].message += ' changed'},
    row => {row.cases[0].report.issues.ERROR[0].location_description = null},
    row => {row.cases[0].report.issues.INFO.push({message: 'Unrelated', severity: 20})},
    row => {row.cases[0].exception.children[0].message += ' changed'},
    row => {row.cases[0].inputs_sha256['ro-crate-metadata.json'] = '0'.repeat(64)},
    row => {row.cases.reverse()},
    row => {row.collection_diagnostic_correction.capture_sha256 = '0'.repeat(64)},
    row => {row.collection_diagnostic_correction.functions.clone_list = '0'.repeat(64)},
  ]) {
    const changed = structuredClone(corrected); mutate(changed)
    assert.throws(() => assertCaptureBounds(original, changed))
  }
})

test('diagnostic inputs and expectations cannot be altered through exported registries', () => {
  for (const name of ['collection-diagnostics/cycle', 'collection-diagnostics/valid-partial']) {
    const item = cases.find(row => row.name === name)
    const expected = name.endsWith('/cycle') ? corrected.cases[0] : originalByName.get(name)
    assertResult(item, expected)
    for (const mutate of [
      row => {row.name += '-unregistered'},
      row => {row.files['ro-crate-metadata.json'] += '\n'},
      row => {row.contexts = {'urn:other': {'@context': {}}}},
      row => {row.files['unregistered.txt'] = 'extra'},
    ]) {
      const changed = structuredClone(item); mutate(changed)
      assert.throws(() => assertResult(changed, expected))
    }
    const text = item.files['ro-crate-metadata.json']
    try {
      item.files['ro-crate-metadata.json'] += '\n'
      assert.throws(() => assertResult(item, expected))
    } finally {item.files['ro-crate-metadata.json'] = text}
    const record = originalByName.get(name)
    assert.ok(Object.isFrozen(record))
  }
})
