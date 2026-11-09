import assert from 'node:assert/strict'
import test from 'node:test'
import rdf from 'rdf-validate-shacl/src/defaultEnv.js'
import {inferenceDataset, RDF} from '../../src/profile/inference/dataset.js'
import {inversePathFormatter} from '../../src/profile/diagnostics/inverse-path.js'
import {withNamespaces} from '../../src/metadata/rdf/namespaces.js'

const first = rdf.namedNode(RDF + 'first'), rest = rdf.namedNode(RDF + 'rest')
const nil = rdf.namedNode(RDF + 'nil'), head = rdf.blankNode('head'), tail = rdf.blankNode('tail')
const item = rdf.namedNode('urn:item'), other = rdf.namedNode('urn:other')
const quad = (s, p, o) => rdf.quad(s, p, o)
function fixture(quads, options) {
  const inference = inferenceDataset(rdf.dataset(quads), rdf, {inputQuads: quads, ...options})
  const label = () => inversePathFormatter(inference,
    withNamespaces([], {format: iri => '<' + iri + '>'}), 'file:///selected/')
  return {inference, label}
}

test('diagnostic lists retain partial prefixes without satisfying OWL LIST antecedents', () => {
  const {inference, label} = fixture([quad(head, first, item)])
  assert.deepEqual(inference.collection(head).members(), [])
  assert.equal(label()(head), '( <urn:item> )')
  inference.add(head, rest, tail)
  inference.add(tail, first, other)
  assert.deepEqual(inference.collection(head).members(), [])
  assert.equal(label()(head), '( <urn:item> <urn:other> )')
})

for (const member of [rdf.literal(''), rdf.literal('0', rdf.namedNode('http://www.w3.org/2001/XMLSchema#integer')),
  rdf.literal('false', rdf.namedNode('http://www.w3.org/2001/XMLSchema#boolean'))])
  test('diagnostic members retain literal value ' + JSON.stringify(member.value), () => {
    const {label} = fixture([quad(head, first, member)])
    const text = label()(head)
    assert.ok(text.includes('Literal("' + member.value + '"'))
    assert.notEqual(text, '(  )')
  })

test('diagnostic traversal follows rest across a cell without a first value', () => {
  const empty = rdf.blankNode('empty')
  const {label} = fixture([quad(head, first, item), quad(head, rest, empty),
    quad(empty, rest, tail), quad(tail, first, other), quad(tail, rest, nil)])
  assert.equal(label()(head), '( <urn:item> <urn:other> )')
})

for (const reverse of [false, true]) {
  test('diagnostic first arcs retain explicit assertion order with precreated terms: ' + reverse, () => {
    const members = reverse ? [other, item] : [item, other]
    const preload = quad(rdf.blankNode('preload'), rdf.namedNode('urn:preload'), members[1])
    const {inference, label} = fixture([preload, ...members.map(member => quad(head, first, member)), quad(head, rest, nil)])
    assert.deepEqual(new Set(inference.collection(head).members().map(term => term.value)), new Set([item.value, other.value]))
    assert.equal(label()(head), '( <' + members[0].value + '> )')
  })
  test('diagnostic rest arcs retain explicit assertion order with precreated terms: ' + reverse, () => {
    const tails = reverse ? [tail, nil] : [nil, tail]
    const preload = quad(rdf.blankNode('preload'), rdf.namedNode('urn:preload'), tails[1])
    const {inference, label} = fixture([preload, quad(head, first, item), ...tails.map(value => quad(head, rest, value)),
      quad(tail, first, other), quad(tail, rest, nil)])
    assert.deepEqual(new Set(inference.collection(head).members().map(term => term.value)), new Set([item.value, other.value]))
    assert.equal(label()(head), reverse ? '( <urn:item> <urn:other> )' : '( <urn:item> )')
  })
}

test('diagnostic arc order includes inferred additions after original assertions', () => {
  const {inference, label} = fixture([quad(rdf.blankNode('preload'), rdf.namedNode('urn:preload'), other)])
  inference.add(head, first, item)
  inference.add(head, first, other)
  inference.add(head, rest, nil)
  assert.equal(label()(head), '( <urn:item> )')
})

test('generalized cells retain full RDF identity in diagnostic assertion order', () => {
  const integer = rdf.literal('0', rdf.namedNode('http://www.w3.org/2001/XMLSchema#integer'))
  const string = rdf.literal('0', rdf.namedNode('http://www.w3.org/2001/XMLSchema#string'))
  const {label} = fixture([quad(rdf.blankNode('preload'), rdf.namedNode('urn:preload'), other),
    quad(integer, first, item), quad(string, first, item), quad(string, first, other),
    quad(head, first, rdf.literal('head')), quad(head, rest, string), quad(string, rest, nil)])
  assert.equal(label()(head), '( Literal("head", datatype=<http://www.w3.org/2001/XMLSchema#string>) <urn:item> )')
})

test('diagnostic lists use the graph and arc order captured before later inference', () => {
  const {inference, label} = fixture([quad(head, first, item), quad(head, rest, tail)])
  const before = label()
  inference.add(tail, first, other)
  inference.add(tail, rest, nil)
  assert.equal(before(head), '( <urn:item> )')
  assert.equal(label()(head), '( <urn:item> <urn:other> )')
})

for (const self of [true, false]) test('recursive rest has a deterministic visible bound: ' + self, () => {
  const quads = [quad(head, first, item), quad(head, rest, self ? head : tail)]
  if (!self) quads.push(quad(tail, first, other), quad(tail, rest, tail))
  const {label} = fixture(quads)
  const expected = self ? '( <urn:item> <http://recursion.too.deep> )'
    : '( <urn:item> <urn:other> <http://recursion.too.deep> )'
  assert.equal(label()(head), expected)
  assert.equal(label()(rdf.blankNode('head')), expected)
})

test('a cycle marker does not consume a nonexistent additional member or visit', () => {
  const {label} = fixture([quad(head, first, item), quad(head, rest, head)], {maxPaths: 1})
  assert.equal(label()(head), '( <urn:item> <http://recursion.too.deep> )')
})

test('finite diagnostics keep the configured path budget instead of silently truncating', () => {
  const {label} = fixture([quad(head, first, item), quad(head, rest, tail),
    quad(tail, first, other), quad(tail, rest, nil)], {maxPaths: 1})
  assert.throws(() => label()(head), /path budget/)
})

test('cells without first values still consume the traversal budget', () => {
  const end = rdf.blankNode('end')
  const {label} = fixture([quad(head, first, item), quad(head, rest, tail),
    quad(tail, rest, end), quad(end, rest, nil)], {maxPaths: 2})
  assert.throws(() => label()(head), /path budget/)
})
