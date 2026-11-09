import assert from 'node:assert/strict'
import test from 'node:test'
import rdf from 'rdf-validate-shacl/src/defaultEnv.js'
import {inferenceDataset, RDF, OWL} from '../../src/profile/inference/dataset.js'
import {inconsistencyMessages} from '../../src/profile/inference/errors.js'

const n = value => rdf.namedNode('urn:' + value)
function fixture(kind, members) {
  const graph = rdf.dataset(), q = (s, p, o) => graph.add(rdf.quad(s, rdf.namedNode(p), o))
  q(n('axiom'), RDF + 'type', rdf.namedNode(OWL + kind))
  q(n('axiom'), OWL + 'members', n('cell0'))
  members.forEach((member, i) => {
    q(n('cell' + i), RDF + 'first', member)
    q(n('cell' + i), RDF + 'rest', i + 1 === members.length ? rdf.namedNode(RDF + 'nil') : n('cell' + (i + 1)))
  })
  return {q, errors: () => [...inconsistencyMessages(inferenceDataset(graph, rdf))]}
}

for (const [name, length, overlap] of [
  ['two-member pair', 2, [0, 1]], ['three-member first pair', 3, [0, 1]],
  ['three-member last pair', 3, [1, 2]], ['three-member outer pair', 3, [0, 2]],
]) test('AllDisjointProperties checks ' + name, () => {
  const {q, errors} = fixture('AllDisjointProperties', Array.from({length}, (_, i) => n('p' + i)))
  for (const i of overlap) q(n('a'), 'urn:p' + i, n('b'))
  assert.equal(errors().length, 1)
  assert.match(errors()[0], /Disjoint properties in an 'AllDisjointProperties'/)
})

test('AllDisjointProperties retains nonoverlapping and empty-extension controls', () => {
  const {q, errors} = fixture('AllDisjointProperties', [n('p0'), n('p1')])
  assert.deepEqual(errors(), [])
  q(n('a'), 'urn:p0', n('b')); q(n('a'), 'urn:p1', n('c'))
  assert.deepEqual(errors(), [])
})

for (const members of [[n('a'), n('a')], [n('a'), n('b'), n('b')]])
  test('AllDifferent rejects repeated terms at distinct collection positions: ' + members.length, () => {
    const {q, errors} = fixture('AllDifferent', members)
    for (const member of members) q(member, OWL + 'sameAs', member)
    assert.equal(errors().length, 1)
    assert.match(errors()[0], /'sameAs' and 'AllDifferent'/)
  })

test('AllDifferent checks distinct terms in the final pair', () => {
  const {q, errors} = fixture('AllDifferent', [n('a'), n('b'), n('c')])
  q(n('b'), OWL + 'sameAs', n('c'))
  assert.equal(errors().length, 1)
  assert.match(errors()[0], /\(urn:b, urn:c\)/)
})

test('AllDifferent keeps unrelated members valid', () => {
  const {q, errors} = fixture('AllDifferent', [n('a'), n('b'), n('c')])
  for (const member of [n('a'), n('b'), n('c')]) q(member, OWL + 'sameAs', member)
  assert.deepEqual(errors(), [])
})

test('AllDisjointClasses still checks the last member', () => {
  const {q, errors} = fixture('AllDisjointClasses', [n('a'), n('b'), n('c')])
  q(n('instance'), RDF + 'type', n('b')); q(n('instance'), RDF + 'type', n('c'))
  assert.equal(errors().length, 1)
})
