import assert from 'node:assert/strict'
import test from 'node:test'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'

for (const typeAlias of [false, true]) {
  test(`undefined ${typeAlias ? 'type alias preserves' : 'ordinary key does not select'} JSON literal typing`, async () => {
    const document = {'@context': {value: 'urn:value', ...(typeAlias ? {undefined: '@type'} : {})},
      '@id': 'urn:subject', value: {'@value': '1', undefined: '@json'}}
    const before = JSON.stringify(document)
    const dataset = await rdfDataset(document)
    assert.equal(dataset.length, 1)
    assert.equal(dataset[0].object.value, typeAlias ? '"1"' : '1')
    assert.equal(dataset[0].object.datatype.value, typeAlias
      ? 'http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON'
      : '')
    assert.equal(JSON.stringify(document), before)
  })
}
