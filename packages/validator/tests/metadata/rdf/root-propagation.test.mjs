import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createDocumentLoader} from '@bijux/ro-crate-core'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'
import {jsonld, jsonldOptions} from '../../../src/metadata/jsonld.js'
import {referenceCardinalityValue} from '../../../src/metadata/rdf/literals/numeric-values.js'

const fixture = new URL('../../../../../tests/reference/root-context-propagation/', import.meta.url)
const bytes = await readFile(new URL('graphs-input.json', fixture))
const {cases} = JSON.parse(bytes)
const expected = JSON.parse(await readFile(new URL('graphs.json', fixture)))
assert.equal(expected.inputs_sha256, createHash('sha256').update(bytes).digest('hex'))
assert.deepEqual(expected.cases.map(row => row.name), cases.map(row => row.name))
const pin = JSON.parse(await readFile(new URL('../../../../../docs/compatibility/reference.json', import.meta.url)))
assert.equal(expected.reference, pin.commit)
const original = JSON.parse(await readFile(new URL('original-primitive.json', fixture)))
const preserved = cases.find(item => item.name === original.input.name)
assert.deepEqual({name: preserved.name, document: preserved.document, contexts: preserved.contexts}, original.input)
assert.deepEqual(expected.cases.find(row => row.name === preserved.name).original_exception, original.expected.exception)

const term = value => value.termType === 'Literal'
  ? ['Literal', value.value, value.datatype.value, value.language ?? ''] : [value.termType, value.value]
for (const item of cases) test('root context propagation: ' + item.name, async () => {
  const before = JSON.stringify(item)
  const quads = await rdfDataset(item.document,
    {documentLoader: createDocumentLoader(new Map(Object.entries(item.contexts ?? {})))})
  const triples = quads.map(q => [term(q.subject), term(q.predicate), term(q.object)])
    .sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)
  assert.deepEqual(triples, expected.cases.find(row => row.name === item.name).triples)
  if (item.name.startsWith('native-')) {
    const quad = quads.find(quad => quad.predicate.value === 'urn:p')
    assert.equal(referenceCardinalityValue(quads, quad.object, quad), 1)
  }
  assert.equal(JSON.stringify(item), before)
})

test('nonpropagating root contexts keep the physical-parent refusal', async () => {
  for (const context of [
    [{p: 'urn:p', '@base': '../'}, {'@propagate': false}],
    [{p: {'@id': 'urn:p', '@type': '@id'}}, {'@propagate': false}],
  ]) {
    const document = {'@context': context, '@id': context[0]['@base'] ? 'item' : 'urn:s',
      p: context[0]['@base'] ? 'value' : '../outside'}
    await assert.rejects(rdfDataset(document), /physical parent directory outside the selected crate/)
  }
})

for (const item of cases.filter(item => item.name.endsWith('type-scope-reference')))
  test('standard metadata processing keeps its own context semantics: ' + item.name, async () => {
    const options = jsonldOptions({rdfRootPropagation: {pending: true, contexts: new WeakSet()}})
    assert.equal(Object.hasOwn(options, 'rdfRootPropagation'), false)
    const quads = await jsonld.toRDF(item.document, options)
    const triples = quads.map(q => [term(q.subject), term(q.predicate), term(q.object)])
      .sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)
    assert.deepEqual(triples, expected.cases.find(row => row.name === item.name).standard_triples)
  })
