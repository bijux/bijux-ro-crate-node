import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
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

for (const scenario of oracle.cases) {
  test('pinned owlrl: ' + scenario.name, () => {
    const graph = rdf.dataset(scenario.triples.map(quad))
    const inference = materializeProfile(graph, rdf)
    for (const query of scenario.queries)
      assert.equal(inference.has(...query.triple.map(term)), query.present, JSON.stringify(query.triple))
    assert.ok([...graph].every(q => q.subject.termType !== 'Literal'), 'Literal facts must remain internal')
    assert.ok([...inference.graph].every(q => q.predicate.termType !== 'BlankNode'), 'Blank predicates must be removed after closure')
  })
}

test('all inference groups consume one shared inferred-quad budget', () => {
  const graph = rdf.dataset([
    quad(['ex:a', 'ex:p', 'ex:b']), quad(['ex:p', 'rdfs:domain', 'ex:C']),
    quad(['ex:C', 'owl:hasValue', 'ex:d']), quad(['ex:C', 'owl:onProperty', 'ex:q']),
  ])
  assert.throws(() => materializeProfile(graph, rdf, {maxInferredQuads: 1}), /inferred quad budget/)
  assert.equal(graph.has(quad(['ex:a', 'ex:q', 'ex:d'])), false)
})
