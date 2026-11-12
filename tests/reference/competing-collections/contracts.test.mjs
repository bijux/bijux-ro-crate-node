import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {registeredCollections, qualifyCapture, assertQualifiedSnapshot} from '../../parity/qualification.mjs'

test('collection qualifications require exact registered names, file bytes and contexts', () => {
  const item = structuredClone(registeredCollections[0])
  for (const mutation of ['name', 'bytes', 'context']) {
    const changed = structuredClone(item)
    if (mutation === 'name') changed.name += '/unregistered'
    if (mutation === 'bytes') changed.files['ro-crate-metadata.json'] += '\n'
    if (mutation === 'context') changed.contexts = {'https://example.test/context': {'@context': {}}}
    assert.throws(() => qualifyCapture([changed], {cases: []}, {cases: []}))
  }
})

test('qualified public snapshots reject missing, extra and mutated dispositions', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../../parity/expected/crates.json', import.meta.url)))
  assertQualifiedSnapshot(snapshot)
  for (const mutation of ['missing', 'extra', 'report', 'stamp']) {
    const changed = structuredClone(snapshot)
    if (mutation === 'missing') changed.collection_qualification.dispositions.pop()
    if (mutation === 'extra') changed.collection_qualification.dispositions.push(structuredClone(changed.collection_qualification.dispositions[0]))
    if (mutation === 'report') changed.cases.find(row => row.name === registeredCollections[0].name).report.issues.ERROR[0].message = 'unregistered'
    if (mutation === 'stamp') changed.collection_qualification.correction.guard_sha256 = '0'.repeat(64)
    assert.throws(() => assertQualifiedSnapshot(changed))
  }
})

test('shards qualify only their exact registered subset and reject missing observations', async () => {
  const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)))
  const original = await read('./original.json'), corrected = await read('./corrected.json')
  const cases = registeredCollections.filter((_, index) => index % 12 === 0)
  const names = new Set(cases.map(item => item.name))
  const corpus_sha256 = createHash('sha256').update(JSON.stringify(cases)).digest('hex')
  for (const capture of [original, corrected]) {
    capture.cases = capture.cases.filter(row => names.has(row.name))
    capture.corpus_sha256 = corpus_sha256
  }
  corrected.collection_correction.observations = corrected.collection_correction.observations.filter(row => names.has(row.name))
  const result = qualifyCapture(cases, original, corrected)
  assert.equal(result.collection_qualification.qualified_collection_cases, cases.length)
  assert.equal(result.collection_qualification.ordinary_exact_cases, 0)
  for (const mutation of ['observation', 'case', 'exception', 'report']) {
    const changed = structuredClone(corrected)
    if (mutation === 'observation') changed.collection_correction.observations.pop()
    if (mutation === 'case') changed.cases.pop()
    if (mutation === 'exception') changed.cases[0].exception = {type: 'AttributeError', message: 'instrumentation failure'}
    if (mutation === 'report') changed.cases[0].report.issues.ERROR[0].message = 'unexpected'
    assert.throws(() => qualifyCapture(cases, original, changed))
  }
})
