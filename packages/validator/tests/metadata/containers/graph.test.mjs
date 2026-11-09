import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createDocumentLoader} from '@bijux/ro-crate-core'
import {jsonld, jsonldOptions, rdfOptions} from '../../../src/metadata/jsonld.js'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'

const folder = new URL('../../../../../tests/reference/jsonld-containers/', import.meta.url)
const bytes = await readFile(new URL('graph-documents.json', folder))
const {cases} = JSON.parse(bytes), expected = JSON.parse(await readFile(new URL('graph-expanded.json', folder)))
assert.equal(expected.inputs_sha256, createHash('sha256').update(bytes).digest('hex'))
assert.deepEqual(expected.cases.map(row => row.name), cases.map(row => row.name))
for (const [index, item] of cases.entries()) test(item.name + ' preserves the complete standard expansion', async () => {
  const before = structuredClone(item.document)
  assert.deepEqual(await jsonld.expand(item.document, jsonldOptions({})), expected.cases[index].expanded)
  assert.deepEqual(item.document, before)
})

for (const serialized of [false, true]) test('graph wrapping stays correct across scoped loaders and isolated caches: ' + serialized, async () => {
  const context = {'@context': {p: {'@id': 'urn:p', '@container': '@graph'}}}
  const url = 'https://example.org/context/graph'
  const options = {documentLoader: createDocumentLoader(new Map([[url, serialized ? JSON.stringify(context) : context]]))}
  const document = {'@context': url, '@id': 'urn:a', p: {'@id': 'urn:b'}}
  const before = structuredClone(document)
  const standard = async () => assert.deepEqual(await jsonld.expand(document, jsonldOptions(options)),
    [{'@id': 'urn:a', 'urn:p': [{'@graph': [{'@id': 'urn:b'}]}]}])
  const rdf = async () => {
    const graph = await rdfDataset(document, options)
    const links = graph.filter(q => q.subject.value === 'urn:a' && q.predicate.value === 'urn:p' && q.graph.termType === 'DefaultGraph')
    assert.equal(links.length, 1)
    assert.equal(links[0].object.termType, 'BlankNode')
  }
  assert.notEqual(jsonldOptions(options).contextResolver, rdfOptions(options).contextResolver)
  await Promise.all([standard(), rdf()]); await rdf(); await standard()
  await Promise.all([rdf(), standard(), rdf(), standard()])
  assert.deepEqual(document, before)
})
