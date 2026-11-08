import assert from 'node:assert/strict'
import test from 'node:test'
import {jsonld} from '../../../src/metadata/jsonld.js'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'

const context = {p: 'urn:property', name: 'urn:name'}
for (const labels of [['b0'], ['b0', 'b1', 'b2']]) {
  test(`explicit ${labels.join(', ')} IDs cannot alias anonymous nodes or list cells`, async () => {
    const graph = labels.map(label => ({'@id': '_:' + label, name: label}))
    graph.push({'@id': 'urn:subject', p: {'@list': [
      {'@id': '_:' + labels[0]}, {name: 'anonymous'},
    ]}})
    const quads = await rdfDataset({'@context': context, '@graph': graph})
    for (const label of labels) assert.ok(quads.some(q =>
      q.subject.termType === 'BlankNode' && q.subject.value === label && q.object.value === label))
    const anonymous = quads.find(q => q.predicate.value === 'urn:name' && q.object.value === 'anonymous').subject
    assert.ok(!labels.includes(anonymous.value))
    const cells = quads.filter(q => q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first')
    assert.equal(cells.length, 2)
    assert.ok(cells.every(q => !labels.includes(q.subject.value) && q.subject.value !== anonymous.value))
    assert.equal(new Set(cells.map(q => q.subject.value)).size, 2)
    assert.ok(cells.some(q => q.object.termType === 'BlankNode' && q.object.value === labels[0]))
    assert.ok(cells.some(q => q.object.termType === 'BlankNode' && q.object.value === anonymous.value))
  })
}

test('explicit named graph labels survive RDF construction', async () => {
  const quads = await rdfDataset({'@context': context, '@id': '_:graph-label',
    '@graph': [{'@id': '_:subject-label', p: {'@id': '_:object-label'}}]})
  assert.equal(quads.length, 1)
  assert.deepEqual([quads[0].graph.value, quads[0].subject.value, quads[0].object.value],
    ['graph-label', 'subject-label', 'object-label'])
})

test('standard JSON-LD conversion keeps its default blank-node issuer', async () => {
  const document = {'@context': context, '@id': '_:explicit-label', name: 'value'}
  const standard = await jsonld.toRDF(document)
  assert.notEqual(standard[0].subject.value, 'explicit-label')
  const reference = await rdfDataset(document)
  assert.equal(reference[0].subject.value, 'explicit-label')
})

for (const [position, document] of Object.entries({
  subject: {'@id': '_:', 'urn:p': 'value'},
  object: {'@id': 'urn:subject', 'urn:p': {'@id': '_:'}},
  predicate: {'@id': 'urn:subject', '_:': 'value'},
  graph: {'@id': '_:', '@graph': [{'@id': 'urn:subject', 'urn:p': 'value'}]},
})) {
  test(`the bare blank-node prefix is a URI in ${position} position`, async () => {
    const [quad] = await rdfDataset(document)
    assert.deepEqual(quad[position], {termType: 'NamedNode', value: '_:'})
  })
}

test('a real IRI cannot collide with the bare-prefix adapter marker', async () => {
  const iri = 'urn:bijux:rdf:bare-blank-prefix'
  const quads = await rdfDataset({'@id': '_:', 'urn:p': {'@id': iri}})
  assert.deepEqual(quads[0].subject, {termType: 'NamedNode', value: '_:'})
  assert.deepEqual(quads[0].object, {termType: 'NamedNode', value: iri})
})
