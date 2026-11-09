import assert from 'node:assert/strict'
import test from 'node:test'
import {jsonld, jsonldOptions, rdfOptions} from '../../../src/metadata/jsonld.js'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
for (const key of ['@type', 'kind']) for (const types of ['@future', ['urn:Existing', '@future'], ['@Future', 'urn:Existing', '@future'], ['urn:Existing', '@ID']])
  test(key + ': ' + JSON.stringify(types) + ' ignores only null-expanded type identifiers', async () => {
    const document = {'@context': {kind: '@type', q: 'urn:q'}, '@id': 'urn:a', [key]: types, q: 'text'}
    const wanted = (Array.isArray(types) ? types : [types]).filter(value => value === 'urn:Existing')
    for (const options of [jsonldOptions({}), rdfOptions({})]) {
      const expanded = await jsonld.expand(document, options)
      if (wanted.length) assert.deepEqual(expanded[0]['@type'], wanted)
      else assert.ok(!Object.hasOwn(expanded[0], '@type'))
      const graph = await jsonld.toRDF(document, options)
      assert.deepEqual(graph.filter(quad => quad.predicate.value === RDF_TYPE).map(quad => quad.object.value), wanted)
      assert.ok(graph.some(quad => quad.subject.value === 'urn:a' && quad.predicate.value === 'urn:q' && quad.object.value === 'text'))
    }
    const graph = await rdfDataset(document)
    assert.deepEqual(graph.filter(quad => quad.predicate.value === RDF_TYPE).map(quad => quad.object.value), wanted)
  })

test('reserved-looking values do not suppress valid nonreserved at-prefix IRIs', async () => {
  const document = {'@context': {q: 'urn:q'}, '@id': 'urn:a', '@type': ['urn:Existing', '@future1'], q: 'text'}
  const graph = await rdfDataset(document)
  assert.deepEqual(graph.filter(quad => quad.predicate.value === RDF_TYPE).map(quad => quad.object.value), ['urn:Existing', 'file:///crate/@future1'])
})

test('reserved map indices retain their existing node types and ordinary edges', async () => {
  const document = {'@context': {p: {'@id': 'urn:p', '@container': '@type'}, q: 'urn:q'}, '@id': 'urn:a',
    p: {'@future': {'@id': 'urn:b', '@type': ['urn:Existing'], q: 'text'}}}
  const graph = await rdfDataset(document)
  assert.deepEqual(graph.filter(quad => quad.predicate.value === RDF_TYPE).map(quad => quad.object.value), ['urn:Existing'])
  assert.ok(graph.some(quad => quad.subject.value === 'urn:a' && quad.predicate.value === 'urn:p' && quad.object.value === 'urn:b'))
})
