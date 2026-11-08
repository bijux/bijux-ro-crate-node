import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {rdfDataset} from '../../src/metadata/rdf/dataset.js'
import {referenceDatatype} from '../../src/metadata/rdf/literals/datatype-aliases.js'
import {parseMetadata} from '../../src/metadata/json/parse.js'
import {localLoader} from '../../src/profile/loader.js'
import {jsonld, jsonldOptions, rdfOptions} from '../../src/metadata/jsonld.js'

const bytes = await readFile(new URL('../../../../tests/parity/contexts/relative-mappings.json', import.meta.url))
const input = parseMetadata(bytes.toString('utf8'))
const oracle = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/relative-contexts.json', import.meta.url)))
assert.equal(createHash('sha256').update(bytes).digest('hex'), oracle.inputs_sha256)
assert.equal(input.cases.length, oracle.cases.length)
const compare = (a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0
for (const item of input.cases) test(item.name + ' retains pinned relative RDF mappings', async () => {
  const expected = oracle.cases.find(c => c.name === item.name)
  assert.ok(expected)
  assert.ok(!expected.exception, 'This corpus requires completed independent graph capture')
  const dataset = await rdfDataset(item.document, {baseURL: item.base, documentLoader: localLoader(new Map(Object.entries(item.contexts)))})
  const term = value => value.termType === 'Literal'
    ? ['Literal', value.value, value.language ? null : referenceDatatype(dataset, value), value.language ?? '']
    : [value.termType, value.value]
  const actual = dataset.map(q => [term(q.subject), term(q.predicate), term(q.object)]).sort(compare)
  assert.deepEqual(actual, expected.triples)
})

for (const kind of ['inline', 'remote', 'import', 'property', 'type']) for (const serialized of [false, true]) {
  test(kind + ' relative context keeps RDF and standard caches isolated (' + serialized + ')', async () => {
    const url = 'https://example.org/context'
    const remote = {'@context': {relative: '#/'}}
    const resources = new Map([[url, serialized ? JSON.stringify(remote) : remote]])
    const options = {baseURL: 'file:///crate/ro-crate-metadata.json', documentLoader: localLoader(resources)}
    const context = kind === 'remote' ? url : kind === 'import' ? {'@import': url} : remote['@context']
    let document = {'@context': context, '@id': 'urn:subject', relative: 'value'}
    if (kind === 'property') document = {'@context': {outer: {'@id': 'urn:outer', '@context': url}},
      '@id': 'urn:subject', outer: {'@id': 'urn:child', relative: 'value'}}
    if (kind === 'type') document = {'@context': {Class: {'@id': 'urn:Class', '@context': url}},
      '@id': 'urn:subject', '@type': 'Class', relative: 'value'}
    const before = JSON.stringify(document)
    assert.notEqual(rdfOptions(options).contextResolver, jsonldOptions(options).contextResolver)
    assert.equal(rdfOptions(options).rdfLibRelativeIRIs, true)
    assert.equal(jsonldOptions(options).rdfLibRelativeIRIs, undefined)
    const rdf = async () => {
      const dataset = await rdfDataset(document, options)
      assert.equal(dataset.filter(q => q.predicate.value === '#/').length, 1)
    }
    const standard = () => assert.rejects(jsonld.expand(document, jsonldOptions(options)), error =>
      error.name === 'jsonld.SyntaxError' && error.details.code ===
        (kind === 'property' || kind === 'type' ? 'invalid scoped context' : 'invalid IRI mapping'))
    await Promise.all([rdf(), standard()])
    await standard(); await rdf(); await standard(); await rdf()
    assert.equal(JSON.stringify(document), before)
  })
}

test('relative RDF predicates do not retain no-colon subjects or objects', async () => {
  const options = {...rdfOptions({}), skipExpansion: true}
  assert.deepEqual(await jsonld.toRDF([{'@id': 'relative', 'urn:p': [{'@id': 'urn:object'}]}], options), [])
  assert.deepEqual(await jsonld.toRDF([{'@id': 'urn:subject', '#/predicate': [{'@id': 'relative'}]}], options), [])
  const kept = await jsonld.toRDF([{'@id': 'urn:subject', '#/predicate': [{'@value': 'value', '@type': '#/datatype'}]}], options)
  assert.equal(kept.length, 1)
  assert.equal(kept[0].object.datatype.value, '#/datatype')
})

test('standard expansion retains its empty type-array behavior', async () => {
  const document = {'@id': 'urn:subject', '@type': [], 'urn:p': [{'@value': 'value'}]}
  assert.deepEqual(await jsonld.expand(document, jsonldOptions({})), [{'@id': 'urn:subject', 'urn:p': [{'@value': 'value'}]}])
})
