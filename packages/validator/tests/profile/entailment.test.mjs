import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import rdf from 'rdf-validate-shacl/src/defaultEnv.js'
import {materializeProfile} from '../../src/profile/inference/closure.js'

const oracle = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/profile-inference.json', import.meta.url), 'utf8'))
const term = value => {
  if (Array.isArray(value)) return rdf.literal(value[0], value[2] || (value[1] ? term(value[1]) : rdf.namedNode('')))
  if (value.startsWith('_:')) return rdf.blankNode(value.slice(2))
  const colon = value.indexOf(':')
  return rdf.namedNode(oracle.prefixes[value.slice(0, colon)] + value.slice(colon + 1))
}
const quad = row => rdf.quad(...row.map(term))

const keyProof = JSON.parse(await readFile(new URL('../../../../tests/reference/key-equality/primitive.json', import.meta.url), 'utf8'))
const keyName = 'pinned key equality includes its final-key quirk'
const keyScenario = oracle.cases.filter(scenario => scenario.name === keyName)
assert.equal(keyScenario.length, 1)
assert.deepEqual(keyProof.prefixes, oracle.prefixes)
assert.deepEqual(keyProof.original, keyScenario[0])
assert.deepEqual(keyProof.original.queries, [{triple: ['ex:a', 'owl:sameAs', 'ex:b'], present: true}])
const correctedKey = structuredClone(keyProof.original)
correctedKey.queries[0].present = false
assert.deepEqual(keyProof.corrected, correctedKey)
for (const [file, hash] of [['capture-primitive.py', keyProof.capture_sha256], ['rules.py', keyProof.key_correction.rules_sha256]])
  assert.equal(createHash('sha256').update(await readFile(new URL('../../../../tests/reference/key-equality/' + file, import.meta.url))).digest('hex'), hash)

for (const scenario of oracle.cases.filter(scenario => scenario.name !== keyName)) {
  test('pinned owlrl: ' + scenario.name, () => {
    const graph = rdf.dataset(scenario.triples.map(quad))
    const literalSubjects = [...graph].filter(q => q.subject.termType === 'Literal')
    const inference = materializeProfile(graph, rdf)
    for (const query of scenario.queries)
      assert.equal(inference.has(...query.triple.map(term)), query.present, JSON.stringify(query.triple))
    assert.deepEqual([...graph].filter(q => q.subject.termType === 'Literal'), literalSubjects,
      'Derived literal-subject facts must remain internal')
    assert.ok([...inference.graph].every(q => q.predicate.termType !== 'BlankNode'), 'Blank predicates must be removed after closure')
  })
}

test('OWL keys require a shared value for their final property', () => {
  const inference = materializeProfile(rdf.dataset(keyProof.corrected.triples.map(quad)), rdf)
  for (const query of keyProof.corrected.queries)
    assert.equal(inference.has(...query.triple.map(term)), query.present, JSON.stringify(query.triple))
})

test('all inference groups consume one shared inferred-quad budget', () => {
  const graph = rdf.dataset([
    quad(['ex:a', 'ex:p', 'ex:b']), quad(['ex:p', 'rdfs:domain', 'ex:C']),
    quad(['ex:C', 'owl:hasValue', 'ex:d']), quad(['ex:C', 'owl:onProperty', 'ex:q']),
  ])
  assert.throws(() => materializeProfile(graph, rdf, {maxInferredQuads: 1}), /inferred quad budget/)
  assert.equal(graph.has(quad(['ex:a', 'ex:q', 'ex:d'])), false)
})
