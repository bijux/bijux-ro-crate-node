import assert from 'node:assert/strict'
import test from 'node:test'
import {rdfDataset} from '../../src/metadata/rdf/dataset.js'

const documents = new Map([
  ['https://example.org/contexts/root.jsonld', {'@context': {'@import': './flags.jsonld'}}],
  ['file:///crate/flags.jsonld', {'@context': {'@propagate': false}}],
  ['https://example.org/contexts/cycle.jsonld', {'@context': './cycle.jsonld'}],
])
const options = {documentLoader: async url => {
  assert.ok(documents.has(url), url)
  return {documentUrl: url, contextUrl: null, document: structuredClone(documents.get(url))}
}}

test('document-relative imported root propagation does not invent RDF facts', async () => {
  assert.deepEqual(await rdfDataset({'@context': 'https://example.org/contexts/root.jsonld', '@id': 'urn:node'}, options), [])
})

test('an explicit propagation override admits the imported root context', async () => {
  assert.deepEqual(await rdfDataset({'@context': ['https://example.org/contexts/root.jsonld', {'@propagate': true}],
    '@id': 'urn:node'}, options), [])
})

test('recursive remote root contexts terminate without expansion', async () => {
  await assert.rejects(rdfDataset({'@context': 'https://example.org/contexts/cycle.jsonld', '@id': 'urn:node'}, options),
    /Recursive JSON-LD context/)
})
