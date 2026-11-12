import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'
import {jsonld, jsonldOptions} from '../../../src/metadata/jsonld.js'
import {validateCrate} from '../../../src/index.js'

const term = value => [value.termType, value.value]
const triples = graph => graph.map(q => [term(q.subject), term(q.predicate), term(q.object)]).sort()
const named = value => ['NamedNode', value]
const blank = value => ['BlankNode', value]
const literal = value => ['Literal', value]
const context = {x: {'@id': '_:blank', '@prefix': true}, p: 'urn:p', name: 'urn:name', identifier: '@id'}

for (const [name, document, expected] of [
  ['subject', {'@id': 'x:child', name: 'value'}, [[named('_:blankchild'), named('urn:name'), literal('value')]]],
  ['object', {'@id': 'urn:root', p: {'@id': 'x:child'}}, [[named('urn:root'), named('urn:p'), named('_:blankchild')]]],
  ['ID alias', {identifier: 'x:child', name: 'value'}, [[named('_:blankchild'), named('urn:name'), literal('value')]]],
  ['raw blank subject', {'@id': '_:blankchild', name: 'value'}, [[blank('blankchild'), named('urn:name'), literal('value')]]],
  ['raw blank object', {'@id': 'urn:root', p: {'@id': '_:blankchild'}}, [[named('urn:root'), named('urn:p'), blank('blankchild')]]],
  ['ID coercion', {'@context': {...context, p: {'@id': 'urn:p', '@type': '@id'}}, '@id': 'urn:root', p: 'x:child'}, [[named('urn:root'), named('urn:p'), blank('blankchild')]]],
  ['vocabulary coercion', {'@context': {...context, p: {'@id': 'urn:p', '@type': '@vocab'}}, '@id': 'urn:root', p: 'x:child'}, [[named('urn:root'), named('urn:p'), blank('blankchild')]]],
  ['type value', {'@id': 'urn:root', '@type': 'x:child'}, [[named('urn:root'), named('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), blank('blankchild')]]],
  ['predicate', {'@id': 'urn:root', 'x:child': 'value'}, []],
]) test('context-created blank spelling retains the RDFLib ' + name + ' constructor', async () => {
  const input = {'@context': context, ...document}
  const before = structuredClone(input)
  assert.deepEqual(triples(await rdfDataset(input)), expected.sort())
  assert.deepEqual(input, before)
})

test('an ID-map key retains its explicit URI constructor', async () => {
  const input = {'@context': {...context, p: {'@id': 'urn:p', '@container': '@id'}},
    '@id': 'urn:root', p: {'x:child': {name: 'value'}}}
  assert.deepEqual(triples(await rdfDataset(input)), [
    [named('urn:root'), named('urn:p'), named('_:blankchild')],
    [named('_:blankchild'), named('urn:name'), literal('value')],
  ].sort())
})

test('named graph labels retain context-created URI identity', async () => {
  const input = {'@context': context, '@id': 'x:graph', '@graph': [{'@id': 'urn:root', name: 'value'}]}
  const [quad] = await rdfDataset(input)
  assert.deepEqual(term(quad.graph), named('_:blankgraph'))
  assert.deepEqual(term(quad.subject), named('urn:root'))
})

test('node-local prefixes retain their selected explicit URI constructor', async () => {
  const input = {'@context': context, '@id': 'x:root', p: {'@context': {x: {'@id': '_:local', '@prefix': true}}, '@id': 'x:child', name: 'value'}}
  assert.deepEqual(triples(await rdfDataset(input)), [
    [named('_:blankroot'), named('urn:p'), named('_:localchild')],
    [named('_:localchild'), named('urn:name'), literal('value')],
  ].sort())
})

test('context-created URI and raw blank labels cannot alias each other or marker-shaped user IRIs', async () => {
  const input = JSON.parse('{"@context":{"x":{"@id":"_:blank","@prefix":true},"m":{"@id":"urn:bijux:rdf:context-","@prefix":true},"name":"urn:name","p":"urn:p","__proto__":"urn:owned"},"@graph":[{"@id":"x:child","name":"named"},{"@id":"_:blankchild","name":"blank"},{"@id":"m:identifier-0","name":"real"},{"@id":"urn:root","p":[{"@id":"x:child"},{"@id":"_:blankchild"},{"@id":"m:identifier-0"}],"__proto__":"owned value"}]}')
  const before = structuredClone(input), prototype = Object.getOwnPropertyDescriptors(Object.prototype)
  const actual = triples(await rdfDataset(input))
  assert.deepEqual(actual, [
    [named('_:blankchild'), named('urn:name'), literal('named')],
    [blank('blankchild'), named('urn:name'), literal('blank')],
    [named('urn:bijux:rdf:context-identifier-0'), named('urn:name'), literal('real')],
    [named('urn:root'), named('urn:p'), named('_:blankchild')],
    [named('urn:root'), named('urn:p'), blank('blankchild')],
    [named('urn:root'), named('urn:p'), named('urn:bijux:rdf:context-identifier-0')],
    [named('urn:root'), named('urn:owned'), literal('owned value')],
  ].sort())
  assert.deepEqual(input, before)
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), prototype)
})

for (const [namespace, value] of [['', 'x:child'], ['urn:namespace:', 'urn:namespace:child']])
  for (const role of ['subject', 'object', 'coercion', 'predicate', 'type'])
    test('prefix namespace ' + JSON.stringify(namespace) + ' preserves lexical construction for ' + role, async () => {
      const selected = {x: {'@id': namespace, '@prefix': true}, p: 'urn:p'}
      const input = {'@context': selected, '@id': 'urn:root'}
      if (role === 'subject') {input['@id'] = 'x:child'; input.p = 'value'}
      else if (role === 'object') input.p = {'@id': 'x:child'}
      else if (role === 'coercion') {selected.p = {'@id': 'urn:p', '@type': '@id'}; input.p = 'x:child'}
      else if (role === 'predicate') input['x:child'] = 'value'
      else input['@type'] = 'x:child'
      const [quad] = await rdfDataset(input)
      assert.ok(quad)
      assert.deepEqual(term(quad[role === 'subject' ? 'subject' : role === 'predicate' ? 'predicate' : 'object']), named(value))
    })

test('ordinary JSON-LD and metadata expansion keep standard blank-prefix construction', async () => {
  const input = {'@context': context, '@id': 'urn:root', p: {'@id': 'x:child'}}
  for (const options of [{}, jsonldOptions({})]) {
    assert.equal((await jsonld.expand(input, options))[0]['urn:p'][0]['@id'], '_:blankchild')
    assert.equal((await jsonld.toRDF(input, options))[0].object.termType, 'BlankNode')
  }
})

const fixtureRoot = new URL('../../../../../tests/parity/fixtures/test_minimal_valid_ro_crate/', import.meta.url)
for (const [namespace, reference] of [['_:blank', '_:blankchild'], ['', 'x:child']])
  test('complete validation retains the undefined URI for prefix ' + JSON.stringify(namespace), async () => {
    const document = JSON.parse(await readFile(new URL('ro-crate-metadata.json', fixtureRoot), 'utf8'))
    document['@context'].push({x: {'@id': namespace, '@prefix': true}, probe: 'urn:probe'})
    document['@graph'][1].probe = {'@id': 'x:child'}
    const files = new Map([['ro-crate-metadata.json', JSON.stringify(document)], ['file_list.tsv', await readFile(new URL('file_list.tsv', fixtureRoot), 'utf8')]])
    const result = await validateCrate(files)
    assert.equal(result.status, 'invalid')
    assert.deepEqual(result.report.issues.ERROR, [{message: 'Found undefined references: ' + reference, severity: 40, location_description: null}])
    assert.deepEqual(result.report.issues.INFO, [])
  })
