import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createDocumentLoader} from '@bijux/ro-crate-core'
import {jsonld, jsonldOptions, rdfOptions} from '../../../src/metadata/jsonld.js'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const folder = new URL('../../../../../tests/reference/jsonld-containers/', import.meta.url)
const bytes = await readFile(new URL('type-documents.json', folder)), {cases} = JSON.parse(bytes)
const expected = JSON.parse(await readFile(new URL('type-expanded.json', folder)))
assert.equal(expected.inputs_sha256, createHash('sha256').update(bytes).digest('hex'))
assert.deepEqual(expected.cases.map(row => row.name), cases.map(row => row.name))
for (const [index, item] of cases.entries()) test(item.name + ' preserves standard expansion and RDF type identifiers', async () => {
  const before = structuredClone(item.document)
  assert.deepEqual(await jsonld.expand(item.document, jsonldOptions({})), expected.cases[index].expanded)
  const graph = await rdfDataset(item.document)
  const types = [...new Set(graph.filter(q => q.predicate.value === RDF_TYPE).map(q => q.object.value))].sort()
  assert.deepEqual(types, expected.cases[index].rdf_types)
  assert.deepEqual(item.document, before)
})

for (const serialized of [false, true]) test('type-map base resolution stays isolated from standard caches: ' + serialized, async () => {
  const url = 'https://example.org/context/type-map'
  const context = {'@context': {p: {'@id': 'urn:p', '@container': '@type'}, q: 'urn:q'}}
  const options = {documentLoader: createDocumentLoader(new Map([[url, serialized ? JSON.stringify(context) : context]]))}
  const document = {'@context': url, '@id': 'urn:a', p: {key: {'@id': 'urn:b', q: 'text'}}}
  const before = structuredClone(document)
  const standard = async () => assert.deepEqual(await jsonld.expand(document, jsonldOptions(options)),
    [{'@id': 'urn:a', 'urn:p': [{'@id': 'urn:b', 'urn:q': [{'@value': 'text'}], '@type': ['key']}]}])
  const rdf = async () => {
    const graph = await rdfDataset(document, options)
    const types = graph.filter(q => q.predicate.value === RDF_TYPE)
    assert.equal(types.length, 1)
    assert.equal(types[0].subject.value, 'urn:b')
    assert.equal(types[0].object.value, 'file:///crate/key')
  }
  assert.notEqual(jsonldOptions(options).contextResolver, rdfOptions(options).contextResolver)
  await Promise.all([standard(), rdf()]); await standard(); await rdf()
  await Promise.all([rdf(), standard(), rdf(), standard()])
  assert.deepEqual(document, before)
})

test('a null-expanded index preserves existing types and node-map construction', async () => {
  const document = {'@context': {p: {'@id': 'urn:p', '@container': '@type'}, q: 'urn:q'}, '@id': 'urn:a',
    p: {'@future': {'@id': 'urn:b', '@type': ['urn:Existing'], q: 'text'}}}
  const before = structuredClone(document)
  for (const options of [jsonldOptions({}), rdfOptions({})]) {
    const expanded = await jsonld.expand(document, options)
    assert.deepEqual(expanded[0]['urn:p'][0]['@type'], ['urn:Existing'])
    const graph = await jsonld.toRDF(document, options)
    assert.ok(graph.some(q => q.subject.value === 'urn:a' && q.predicate.value === 'urn:p' && q.object.value === 'urn:b'))
    assert.ok(graph.some(q => q.subject.value === 'urn:b' && q.predicate.value === RDF_TYPE && q.object.value === 'urn:Existing'))
    assert.ok(graph.some(q => q.subject.value === 'urn:b' && q.predicate.value === 'urn:q' && q.object.value === 'text'))
  }
  assert.deepEqual(document, before)
})

test('disabled type indices retain their independently captured standard omission', async () => {
  const index = cases.findIndex(item => item.name === 'disabled-index-counterpart')
  const document = structuredClone(cases[index].document), value = document.p['@none']
  document.p = {disabled: value}
  assert.deepEqual(await jsonld.expand(document, jsonldOptions({})), expected.cases[index].expanded)
})

test('used parent-dependent type indices retain the physical-root boundary', async () => {
  const document = {'@context': {p: {'@id': 'urn:p', '@container': '@type'}, q: 'urn:q'}, '@id': 'urn:a',
    p: {'../type': {'@id': 'urn:b', q: 'text'}}}
  await assert.rejects(rdfDataset(document), error => error.message ===
    'RDF identifiers depend on a physical parent directory outside the selected crate.')
  document['@context']['@base'] = 'https://example.org/base/'
  const graph = await rdfDataset(document)
  assert.ok(graph.some(q => q.predicate.value === RDF_TYPE && q.object.value === 'https://example.org/type'))
})
