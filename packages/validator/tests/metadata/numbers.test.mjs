import assert from 'node:assert/strict'
import test from 'node:test'
import {parseMetadata} from '../../src/metadata/numbers.js'
import {rdfDataset} from '../../src/metadata/rdf/dataset.js'

test('JSON integer precision survives model input and RDF lexical conversion', async () => {
  const value = '1234567890123456789012345678901234567890'
  const document = parseMetadata(`{"@context":{"year":"http://example.org/year"},"@id":"http://example.org/p","year":${value}}`)
  assert.equal(document.year, BigInt(value))
  const dataset = await rdfDataset(document)
  const literal = dataset.find(quad => quad.predicate.value === 'http://example.org/year').object
  assert.equal(literal.value, value)
  assert.equal(literal.datatype.value, 'http://www.w3.org/2001/XMLSchema#integer')
  assert.equal(parseMetadata('{"label":"9007199254740993"}').label, '9007199254740993')
})
