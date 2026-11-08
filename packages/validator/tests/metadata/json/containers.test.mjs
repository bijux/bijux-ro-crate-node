import assert from 'node:assert/strict'
import test from 'node:test'
import {createDocumentLoader} from '@bijux/ro-crate-core'
import {jsonld, jsonldOptions, rdfOptions} from '../../../src/metadata/jsonld.js'
import {parseMetadata} from '../../../src/metadata/json/parse.js'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'

const JSON_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON'
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const url = 'https://example.org/contexts/json-containers'

function input(kind, container, serialized) {
  const context = {value: {'@id': 'urn:value', '@type': '@json', '@container': container}}
  const remote = {'@context': context}
  const resources = new Map([[url, serialized ? JSON.stringify(remote) : remote]])
  let source
  if (kind === 'inline') source = `{"@context":${JSON.stringify(context)},"@id":"urn:subject","value":1.0}`
  if (kind === 'remote') source = `{"@context":"${url}","@id":"urn:subject","value":1.0}`
  if (kind === 'import') source = `{"@context":{"@import":"${url}"},"@id":"urn:subject","value":1.0}`
  if (kind === 'property') source = `{"@context":{"outer":{"@id":"urn:outer","@context":${JSON.stringify(context)}}},"@id":"urn:subject","outer":{"@id":"urn:nested","value":1.0}}`
  if (kind === 'type') source = `{"@context":{"Class":{"@id":"urn:Class","@context":${JSON.stringify(context)}}},"@id":"urn:subject","@type":"Class","value":1.0}`
  return {document: parseMetadata(source), options: {documentLoader: createDocumentLoader(resources)}}
}

function lists(value) {
  if (!value || typeof value !== 'object') return []
  return (value['@list'] ? [value['@list']] : []).concat(Object.values(value).flatMap(lists))
}

for (const kind of ['inline', 'remote', 'import', 'property', 'type']) {
  for (const container of ['@list', '@type']) {
    for (const serialized of [false, true]) {
      test(`${kind} ${container} JSON coercion isolates RDF and standard caches (${serialized ? 'serialized' : 'parsed'})`, async () => {
        const {document, options} = input(kind, container, serialized)
        const before = JSON.stringify(document)
        const standard = jsonldOptions(options)
        const rdf = rdfOptions(options)
        assert.notEqual(rdf.contextResolver, standard.contextResolver)

        const checkRDF = async () => {
          const dataset = await rdfDataset(document, options)
          const terms = dataset.filter(q => q.predicate.value === 'urn:value')
          assert.equal(terms.length, 1)
          assert.equal(terms[0].object.termType, 'Literal')
          assert.equal(terms[0].object.datatype.value, JSON_TYPE)
          assert.equal(terms[0].object.value, '1.0')
          assert.equal(dataset.some(q => q.predicate.value === RDF + 'first' || q.predicate.value === RDF + 'rest'), false)
        }
        const checkStandard = async () => {
          const run = () => jsonld.expand(document, jsonldOptions(options))
          if (container === '@type') {
            await assert.rejects(run, /Invalid JSON-LD syntax/)
          } else {
            const found = lists(await run())
            assert.equal(found.length, 1)
            assert.equal(found[0].length, 1)
            assert.equal(found[0][0]['@type'], '@json')
            assert.equal(found[0][0]['@value'], 1)
          }
        }

        await Promise.all([checkRDF(), checkStandard()])
        await checkStandard()
        await checkRDF()
        await checkStandard()
        await checkRDF()
        await Promise.all([checkRDF(), checkStandard(), checkRDF(), checkStandard()])
        assert.equal(JSON.stringify(document), before)
      })
    }
  }
}
