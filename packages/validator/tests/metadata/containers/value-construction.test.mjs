import assert from 'node:assert/strict'
import test from 'node:test'
import {jsonld, jsonldOptions, rdfOptions} from '../../../src/metadata/jsonld.js'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'

for (const language of ['en', 'en-US', 'EN-latn-US', 'i-klingon', 'sgn-BE-FR', 'x-private', 'de-CH-1901']) {
  test('well-formed language remains an RDF literal: ' + language, async () => {
    const document = {'@context': {p: 'urn:p'}, '@id': 'urn:a', p: {'@value': 'text', '@language': language}}
    for (const options of [jsonldOptions({}), rdfOptions({})]) {
      const graph = await jsonld.toRDF(document, options)
      assert.equal(graph.length, 1)
      assert.equal(graph[0].object.language, language.toLowerCase())
      assert.equal(graph[0].object.value, 'text')
    }
    assert.equal((await rdfDataset(document)).length, 1)
  })
}
for (const language of ['', '@id', 'en_US', 'en--US', 'en-abcdefghij', '1en']) {
  test('malformed language contributes no RDF triple: ' + JSON.stringify(language), async () => {
    const document = {'@context': {p: 'urn:p', q: 'urn:q'}, '@id': 'urn:a',
      p: {'@value': 'discarded', '@language': language}, q: 'retained'}
    for (const options of [jsonldOptions({}), rdfOptions({})]) {
      const graph = await jsonld.toRDF(document, options)
      assert.equal(graph.length, 1)
      assert.equal(graph[0].predicate.value, 'urn:q')
      assert.equal(graph[0].object.value, 'retained')
    }
    assert.equal((await rdfDataset(document)).length, 1)
  })
}
for (const type of [undefined, '@id', '@vocab']) {
  test('a type-map cannot add a type array to a value object: ' + type, async () => {
    const context = {p: {'@id': 'urn:p', '@container': '@type', ...(type ? {'@type': type} : {})}, value: '@value'}
    const document = {'@context': context, '@id': 'urn:a', p: {'urn:Type': {value: 'text'}}}
    for (const options of [jsonldOptions({}), rdfOptions({})])
      await assert.rejects(jsonld.expand(document, options), error =>
        error.name === 'jsonld.SyntaxError' && error.details.code === 'invalid typed value')
    await assert.rejects(rdfDataset(document), error => error.details.code === 'invalid typed value')
    document.p = {'@none': {value: 'text'}}
    for (const options of [jsonldOptions({}), rdfOptions({})])
      assert.deepEqual(await jsonld.expand(document, options), [{'@id': 'urn:a', 'urn:p': [{'@value': 'text'}]}])
  })
}
