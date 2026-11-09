import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../../src/index.js'
import {compareResult} from '../../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../../tests/parity/inputs.mjs'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'
import {jsonld, jsonldOptions} from '../../../src/metadata/jsonld.js'

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
for (const container of ['@type', '@index', '@id']) for (const key of ['@id', 'id', '@type', 'type', '@context', '@graph', '@value', 'value', '@none', '@future'])
  test(container + ' map index ' + key + ' does not replace its value node', async () => {
    const document = {'@context': {p: {'@id': 'urn:p', '@container': container}, q: 'urn:q',
      id: '@id', type: '@type', value: '@value'}, '@id': 'urn:a',
      p: {[key]: {'@id': 'urn:b', '@type': ['urn:Existing'], q: 'text'}}}
    const before = structuredClone(document), quads = await rdfDataset(document)
    assert.ok(quads.some(quad => quad.subject.value === 'urn:a' && quad.predicate.value === 'urn:p' && quad.object.value === 'urn:b'))
    assert.ok(quads.some(quad => quad.subject.value === 'urn:b' && quad.predicate.value === RDF_TYPE && quad.object.value === 'urn:Existing'))
    assert.ok(quads.some(quad => quad.subject.value === 'urn:b' && quad.predicate.value === 'urn:q' && quad.object.value === 'text'))
    assert.deepEqual(document, before)
  })

test('the actual node ID still rejects a non-string constructor value', async () => {
  const document = {'@context': {q: 'urn:q'}, '@id': {'@id': 'urn:unexpected'}, q: 'text'}
  await assert.rejects(jsonld.expand(document, jsonldOptions({})), error => error.details.code === 'invalid @id value')
})

for (const container of ['@type', '@index', '@id']) {
  test(container + ' index names do not coerce their node values', async () => {
    const document = {'@context': {p: {'@id': 'urn:p', '@container': container},
      T: {'@id': 'urn:T', '@type': '@json'}, q: 'urn:q'}, '@id': 'urn:a',
      p: {T: {'@id': 'urn:b', '@type': ['urn:Existing'], q: 'text'}}}
    const graph = await rdfDataset(document)
    assert.ok(graph.some(quad => quad.subject.value === 'urn:a' && quad.predicate.value === 'urn:p' && quad.object.value === 'urn:b'))
    assert.ok(graph.some(quad => quad.subject.value === 'urn:b' && quad.predicate.value === RDF_TYPE && quad.object.value === 'urn:Existing'))
  })
  test(container + ' preserves nested indexed-node ownership', async () => {
    const document = {'@context': {p: {'@id': 'urn:p', '@container': container},
      q: {'@id': 'urn:q', '@container': '@index'}, r: 'urn:r'}, '@id': 'urn:a',
      p: {'@id': {'@id': 'urn:b', '@type': ['urn:Existing'],
        q: {'@id': {'@id': 'urn:c', '@type': ['urn:Nested'], r: 'text'}}}}}
    const before = structuredClone(document), graph = await rdfDataset(document)
    for (const [id, type] of [['urn:b', 'urn:Existing'], ['urn:c', 'urn:Nested']])
      assert.ok(graph.some(quad => quad.subject.value === id && quad.predicate.value === RDF_TYPE && quad.object.value === type))
    assert.ok(graph.some(quad => quad.subject.value === 'urn:b' && quad.predicate.value === 'urn:q' && quad.object.value === 'urn:c'))
    assert.deepEqual(document, before)
  })
}

const {cases} = JSON.parse(await readFile(new URL('../../../../../tests/parity/inputs/node-index-ownership.json', import.meta.url)))
const oracle = JSON.parse(await readFile(new URL('../../../../../tests/parity/expected/crates.json', import.meta.url)))
for (const item of cases) test(item.name + ' retains the complete original parser outcome', async () => {
  const expected = oracle.cases.find(row => row.name === item.name)
  assertInputBytes(item, expected)
  compareResult(await validateCrate(new Map(Object.entries(item.files))), expected, item.name)
})
