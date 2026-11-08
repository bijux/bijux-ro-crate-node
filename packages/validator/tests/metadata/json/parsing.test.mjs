import assert from 'node:assert/strict'
import test from 'node:test'
import {parseMetadata} from '../../../src/metadata/json/parse.js'
import {jsonldValue} from '../../../src/metadata/json/jsonld-values.js'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'

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

for (const constant of ['NaN', 'Infinity', '-Infinity']) {
  for (const prefix of [String.raw`urn:\u0062ijux:json-number:`, String.raw`urn\u003abijux:json-number:`]) {
    test(`escaped marker text remains a string alongside bare ${constant}: ${prefix}`, () => {
      const parsed = parseMetadata(`{"name":"${prefix}${constant}","probe":${constant}}`)
      assert.equal(parsed.name, 'urn:bijux:json-number:' + constant)
      if (constant === 'NaN') assert.ok(Number.isNaN(parsed.probe))
      else assert.equal(parsed.probe, constant === 'Infinity' ? Infinity : -Infinity)
    })
  }
}

test('non-finite constants require token sources even without finite numeric values', () => {
  const parse = JSON.parse
  JSON.parse = (text, reviver) => parse(text, function (key, value) {return reviver.call(this, key, value)})
  try {
    for (const constant of ['NaN', 'Infinity', '-Infinity'])
      assert.throws(() => parseMetadata(`[${constant}]`), /cannot retain JSON numeric token identity/)
    assert.deepEqual(parseMetadata('["NaN","Infinity","-Infinity"]'), ['NaN', 'Infinity', '-Infinity'])
  } finally {JSON.parse = parse}
})

test('numeric kind tracking preserves primitive model inputs and quoted strings', async () => {
  const document = parseMetadata('{"@id":"urn:subject","urn:value":1.0,"array":[1e0,-0.0,-0],"text":"1.0"}')
  assert.equal(typeof document['urn:value'], 'number')
  assert.equal(document['urn:value'], 1)
  assert.deepEqual(jsonldValue(document), {'@id':'urn:subject', 'urn:value':1, array:[1,-0,0], text:'1.0'})
  assert.equal(Object.is(document.array[1], -0), true)
  assert.equal(Object.is(document.array[2], -0), false)
  const literal = (await rdfDataset(document)).find(q => q.predicate.value === 'urn:value').object
  assert.equal(literal.datatype.value, 'http://www.w3.org/2001/XMLSchema#double')
  assert.equal(literal.value, '1.0')
})

test('missing numeric token-source support refuses validation instead of guessing', () => {
  const parse = JSON.parse
  JSON.parse = (text, reviver) => parse(text, function (key, value) {return reviver.call(this, key, value)})
  try {
    assert.throws(() => parseMetadata('{"value":1.0}'), /cannot retain JSON numeric token identity/)
  } finally {JSON.parse = parse}
})
