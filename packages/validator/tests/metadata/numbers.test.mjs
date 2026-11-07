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

test('Python JSON constants retain numeric meaning without rewriting quoted strings', () => {
  const parsed = parseMetadata('{"nan":NaN,"infinity":Infinity,"negative":-Infinity,"text":"NaN Infinity -Infinity","urn:bijux:json-number:NaN":"literal"}')
  assert.ok(Number.isNaN(parsed.nan))
  assert.equal(parsed.infinity, Infinity)
  assert.equal(parsed.negative, -Infinity)
  assert.equal(parsed.text, 'NaN Infinity -Infinity')
  assert.equal(parsed['urn:bijux:json-number:NaN'], 'literal')
  assert.deepEqual(parseMetadata('[NaN,"NaN",[Infinity]]'), [NaN, 'NaN', [Infinity]])
})

test('JSON constant compatibility does not admit malformed keys or values', () => {
  for (const text of ['{NaN:1}', '[+Infinity]', '[-NaN]', '[NaNtail]', '[preNaN]', '[NaN:]'])
    assert.throws(() => parseMetadata(text), SyntaxError)
})
