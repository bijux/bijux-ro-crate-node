import assert from 'node:assert/strict'
import test from 'node:test'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'

const baseURL = 'file:///a/b/ro-crate-metadata.json'
const values = async (context, id) => (await rdfDataset({
  '@context': context, '@id': id, 'urn:p': 'value',
}, {baseURL})).map(quad => quad.subject.value)

// Exact subjects captured independently from the pinned RDFLib Graph parser.
for (const [name, context] of [
  ['cancelled relative base', {'@base': 'sub/../'}],
  ['chained relative base', [{'@base': 'sub/'}, {'@base': '../'}]],
]) test(name + ' keeps node identities inside the selected root', async () => {
  assert.deepEqual(await values(context, 'x'), ['file:///a/b/x'])
})

for (const [id, subject] of [
  ['', 'file:///a/b/ro-crate-metadata.json?query'],
  ['?', 'file:///a/b/ro-crate-metadata.json?query'],
  ['#new', 'file:///a/b/ro-crate-metadata.json?query#new'],
  ['?#new', 'file:///a/b/ro-crate-metadata.json?query#new'],
]) test('relative query reference ' + JSON.stringify(id) + ' retains the inherited query', async () => {
  assert.deepEqual(await values({'@base': '?query'}, id), [subject])
})

for (const base of ['..', '../', 'a/../..', 'sub//']) test('physical ancestor resolution from ' + base + ' cannot approve', async () => {
  await assert.rejects(values({'@base': base}, base === 'sub//' ? '../../x' : 'x'),
    /physical parent directory outside the selected crate/)
})

test('relative bases after null remain unbased', async () => {
  assert.deepEqual(await values([{'@base': null}, {'@base': 'sub/'}], 'x'), [])
})

for (const base of ['/safe/', '//host/safe/']) test('rooted base ' + base + ' after null cannot invent a scheme', async () => {
  assert.deepEqual(await values([{'@base': null}, {'@base': base}], 'x'), [])
})

for (const base of ['file:///safe/', 'https://host/safe/']) test('absolute base ' + base + ' restores independent resolution after null', async () => {
  assert.deepEqual(await values([{'@base': null}, {'@base': base}], 'x'), [base + 'x'])
})

test('IRI whitespace normalization cannot hide a physical ancestor', async () => {
  await assert.rejects(values({}, ' \t..\r/\n../x'), /physical parent directory outside the selected crate/)
})

test('type-map @none stays a keyword and cannot create a file-root class', async () => {
  const quads = await rdfDataset({'@context': {'p': {'@id': 'urn:p', '@container': '@type'}},
    '@id': 'urn:s', 'p': {'@none': {'@id': 'urn:o'}}}, {baseURL})
  assert.deepEqual(quads.map(q => [q.subject.value, q.predicate.value, q.object.value]),
    [['urn:s', 'urn:p', 'urn:o']])
})
