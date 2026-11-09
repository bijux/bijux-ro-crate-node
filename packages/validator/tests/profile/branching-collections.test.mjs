import assert from 'node:assert/strict'
import test from 'node:test'
import rdf from 'rdf-validate-shacl/src/defaultEnv.js'
import {inferenceDataset, RDF, RDFS, OWL} from '../../src/profile/inference/dataset.js'
import {classRules} from '../../src/profile/inference/classes.js'
import {propertyRules} from '../../src/profile/inference/properties.js'
import {identityRules} from '../../src/profile/inference/identity.js'
import {inconsistencyMessages} from '../../src/profile/inference/errors.js'

const n = value => rdf.namedNode('urn:' + value), nil = rdf.namedNode(RDF + 'nil')
function fixture(options) {
  const inference = inferenceDataset(rdf.dataset(), rdf, options)
  const first = (cell, member) => inference.add(cell, RDF + 'first', member)
  const rest = (cell, tail) => inference.add(cell, RDF + 'rest', tail)
  const cell = (name, member, tail = nil) => {first(n(name), member); rest(n(name), tail); return n(name)}
  return {...inference, inference, first, rest, cell}
}
const pairNames = pairs => pairs.map(pair => pair.map(term => term.value).join(' ')).sort()

test('exclusive first choices are alternatives, not two positions in one witness', () => {
  const f = fixture(); f.cell('head', n('p')); f.first(n('head'), n('q'))
  assert.deepEqual(f.collection(n('head')).members(), [n('p'), n('q')])
  assert.deepEqual(f.collection(n('head')).pairs(), [])
  assert.equal(f.collection(n('head')).accepts(term => term.equals(n('q'))), true)
})

test('pairs remain on one productive rest branch', () => {
  const f = fixture(); f.cell('head', n('p'), n('left')); f.rest(n('head'), n('right'))
  f.cell('left', n('a')); f.cell('right', n('b'))
  assert.deepEqual(pairNames(f.collection(n('head')).pairs()), ['urn:p urn:a', 'urn:p urn:b'])
  f.add(n('axiom'), RDF + 'type', rdf.namedNode(OWL + 'AllDisjointProperties'))
  f.add(n('axiom'), OWL + 'members', n('head'))
  f.add(n('s'), n('a'), n('o')); f.add(n('s'), n('b'), n('o'))
  assert.deepEqual([...inconsistencyMessages(f)], [])
})

test('nonproductive cycles and dead branches never become operands', () => {
  const f = fixture(); f.cell('head', n('p'), n('dead')); f.cell('dead', n('q'), n('head'))
  assert.deepEqual(f.collection(n('head')).members(), [])
  f.rest(n('head'), nil)
  assert.deepEqual(f.collection(n('head')).members(), [n('p'), n('q')])
  assert.ok(f.collection(n('head')).accepts(() => true))
})

test('productive cycles supply repeated positions without enumerating lengths', () => {
  const f = fixture(); f.cell('head', n('p'), n('head')); f.rest(n('head'), nil)
  assert.deepEqual(pairNames(f.collection(n('head')).pairs()), ['urn:p urn:p'])
  f.first(n('head'), n('q'))
  assert.deepEqual(pairNames(f.collection(n('head')).pairs()),
    ['urn:p urn:p', 'urn:p urn:q', 'urn:q urn:p', 'urn:q urn:q'])
})

test('described nil has an empty witness and additional productive witnesses', () => {
  const f = fixture(); f.first(nil, n('p')); f.rest(nil, nil)
  const operand = f.collection(nil)
  assert.deepEqual(operand.members(), [n('p')])
  assert.equal(operand.accepts(() => false), false)
  assert.equal(operand.accepts(() => true), true)
  assert.deepEqual(pairNames(operand.pairs()), ['urn:p urn:p'])
})

test('intersection chooses a complete satisfying branch instead of every alternative', () => {
  const f = fixture(); f.cell('head', n('A')); f.first(n('head'), n('B'))
  f.add(n('I'), OWL + 'intersectionOf', n('head'))
  f.add(n('a'), RDF + 'type', n('A')); f.add(n('b'), RDF + 'type', n('B'))
  f.close([classRules])
  assert.ok(f.has(n('a'), RDF + 'type', n('I')))
  assert.ok(f.has(n('b'), RDF + 'type', n('I')))
  assert.ok(f.has(n('I'), RDFS + 'subClassOf', n('A')))
  assert.ok(f.has(n('I'), RDFS + 'subClassOf', n('B')))
})

for (const headIsNil of [false, true]) test('chain saturation retains every finite productive length: nil=' + headIsNil, () => {
  const f = fixture(), head = headIsNil ? nil : n('head')
  f.first(head, n('p')); f.rest(head, head); if (!headIsNil) f.rest(head, nil)
  f.add(n('result'), OWL + 'propertyChainAxiom', head)
  f.add(n('a'), n('p'), n('b')); f.add(n('b'), n('p'), n('c'))
  f.close([propertyRules])
  assert.ok(f.has(n('a'), n('result'), n('b')))
  assert.ok(f.has(n('b'), n('result'), n('c')))
  assert.ok(f.has(n('a'), n('result'), n('c')))
  assert.equal(f.has(n('a'), n('result'), n('a')), false)
})

test('chain alternatives do not concatenate mutually exclusive first choices', () => {
  const f = fixture(); f.cell('head', n('p')); f.first(n('head'), n('q'))
  f.add(n('result'), OWL + 'propertyChainAxiom', n('head'))
  f.add(n('a'), n('p'), n('b')); f.add(n('b'), n('q'), n('c'))
  f.close([propertyRules])
  assert.ok(f.has(n('a'), n('result'), n('b')))
  assert.ok(f.has(n('b'), n('result'), n('c')))
  assert.equal(f.has(n('a'), n('result'), n('c')), false)
})

for (const final of ['absent', 'different', 'shared']) test('hasKey checks the final property on a complete witness: ' + final, () => {
  const f = fixture(); f.cell('head', n('p'), n('tail')); f.cell('tail', n('q'))
  f.add(n('C'), OWL + 'hasKey', n('head'))
  f.add(n('a'), RDF + 'type', n('C')); f.add(n('b'), RDF + 'type', n('C'))
  f.add(n('a'), n('p'), n('shared')); f.add(n('b'), n('p'), n('shared'))
  f.add(n('a'), n('q'), n('only-a'))
  if (final !== 'absent') f.add(n('b'), n('q'), n(final === 'shared' ? 'only-a' : 'only-b'))
  f.close([identityRules])
  assert.equal(f.has(n('a'), OWL + 'sameAs', n('b')), final === 'shared')
})

test('cyclic product states and member-pair relations retain finite budgets', () => {
  const f = fixture({maxPaths: 2}); f.cell('head', n('p'), n('head')); f.rest(n('head'), nil)
  f.add(n('result'), OWL + 'propertyChainAxiom', n('head'))
  f.add(n('a'), n('p'), n('b')); f.add(n('b'), n('p'), n('c'))
  assert.throws(() => f.close([propertyRules]), /path budget/)
  const g = fixture({maxPaths: 3}); g.cell('head', n('p'), n('tail'))
  g.cell('tail', n('q'), n('head')); g.rest(n('tail'), nil)
  assert.throws(() => g.collection(n('head')).pairs(), /path budget/)
})


test('absent, empty and incomplete operands do not consume a zero path budget', () => {
  const f = fixture({maxPaths: 0})
  f.first(n('first-only'), n('p')); f.first(n('first-only'), n('q'))
  f.rest(n('rest-only'), nil)
  for (const head of [null, nil, n('absent'), n('first-only'), n('rest-only')]) {
    const operand = f.collection(head)
    assert.deepEqual(operand.members(), [])
    assert.deepEqual(operand.pairs(), [])
    assert.equal(operand.accepts(() => true), false)
  }
})
