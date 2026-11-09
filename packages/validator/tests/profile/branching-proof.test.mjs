import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import rdf from 'rdf-validate-shacl/src/defaultEnv.js'
import {inferenceDataset, RDF, OWL} from '../../src/profile/inference/dataset.js'
import {propertyRules} from '../../src/profile/inference/properties.js'

const folder = new URL('../../../../tests/reference/inferred-collections/', import.meta.url)
const expected = JSON.parse(await readFile(new URL('branching-proof.json', folder)))
const graphs = JSON.parse(await readFile(new URL('branching-graphs.json', folder))).cases
const hash = () => createHash('sha256')
for (const [name, key] of [['rules.py', 'rules_sha256'], ['prove-branching.py', 'proof_sha256'],
  ['branching-graphs.json', 'graphs_sha256']])
  assert.equal(hash().update(await readFile(new URL(name, folder))).digest('hex'), expected[key])
const n = value => value === 'nil' ? rdf.namedNode(RDF + 'nil') : rdf.namedNode('urn:' + value)
const nodes = [n('h'), n('t'), n('nil')], labels = [n('p'), n('q')]
const first = rdf.namedNode(RDF + 'first'), rest = rdf.namedNode(RDF + 'rest')
const q = (s, p, o) => rdf.quad(s, p, o)
const names = values => values.map(term => term.value).sort()
const pairs = values => values.map(pair => pair.map(term => term.value)).sort()

test('finite member and coexisting-position relations match independent complete-witness proofs', () => {
  const digest = hash(), topologies = [[1, 0, 2], [1, 2, 0]]
  let rows = 0, members = 0, positions = 0
  for (const [topology, next] of topologies.entries())
    for (let pattern = 0; pattern < 4096; pattern++) {
      const graph = rdf.dataset()
      for (let i = 0; i < nodes.length; i++) {
        const choices = (pattern >> (4 * i)) & 15
        labels.forEach((member, bit) => {if (choices & (1 << bit)) graph.add(q(nodes[i], first, member))})
        ;[nodes[next[i]], nodes[2]].forEach((tail, bit) => {
          if (choices & (1 << (bit + 2))) graph.add(q(nodes[i], rest, tail))
        })
      }
      const inference = inferenceDataset(graph, rdf)
      for (const head of [0, 2]) {
        const operand = inference.collection(nodes[head]), values = names(operand.members()), paired = pairs(operand.pairs())
        digest.update(JSON.stringify([topology, pattern, head, values, paired]) + '\n')
        rows++; members += values.length; positions += paired.length
      }
    }
  assert.equal(rows, expected.head_queries)
  assert.equal(members, expected.members)
  assert.equal(positions, expected.pairs)
  assert.equal(digest.digest('hex'), expected.witness_relations_sha256)
})

test('chain product automata match independent finite suffix-relation saturation', () => {
  const digest = hash(), individuals = [n('a'), n('b')], result = n('result')
  let rows = 0
  for (const scenario of graphs)
    for (let pattern = 0; pattern < 256; pattern++) {
      const graph = rdf.dataset()
      for (const [cell, member, tail] of scenario.arcs) {
        graph.add(q(n(cell), first, n(member))); graph.add(q(n(cell), rest, n(tail)))
      }
      labels.forEach((predicate, index) => individuals.forEach((start, i) => individuals.forEach((end, j) => {
        if (pattern & (1 << (index * 4 + i * 2 + j))) graph.add(q(start, predicate, end))
      })))
      graph.add(q(result, rdf.namedNode(OWL + 'propertyChainAxiom'), n(scenario.head)))
      propertyRules(inferenceDataset(graph, rdf))
      const outputs = pairs([...graph.match(null, result)].map(quad => [quad.subject, quad.object]))
      digest.update(JSON.stringify([scenario.name, pattern, outputs]) + '\n'); rows++
    }
  assert.equal(rows, expected.chain_queries)
  assert.equal(digest.digest('hex'), expected.chain_relations_sha256)
})
