import assert from 'node:assert/strict'
import test from 'node:test'
import rdf from 'rdf-validate-shacl/src/defaultEnv.js'
import {materializeProperties} from '../../src/profile/property-inference.js'

const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
const OWL = 'http://www.w3.org/2002/07/owl#'
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const node = value => rdf.namedNode(value.includes('://') ? value : 'https://example.org/' + value)
const quad = (s, p, o) => rdf.quad(node(s), node(p), node(o))

// Small budgets exercise the same operational boundary without allocating an
// adversarially large intermediate graph in the test runner.
test('unrelated input triples do not consume the inference budget', () => {
  const graph = rdf.dataset(Array.from({length: 10}, (_, i) => quad('item' + i, 'unrelated', 'value')))
  materializeProperties(graph, rdf, {maxInferredQuads: 0, maxPaths: 0})
  assert.equal(graph.size, 10)
  graph.add(quad('p', RDFS + 'subPropertyOf', 'q'))
  graph.add(quad('subject', 'p', 'object'))
  materializeProperties(graph, rdf, {maxInferredQuads: 1})
  assert.ok(graph.has(quad('subject', 'q', 'object')))
})

test('new quads are refused before exceeding the inference budget', () => {
  const graph = rdf.dataset([
    quad('p', RDFS + 'subPropertyOf', 'q'),
    quad('first', 'p', 'object'), quad('second', 'p', 'object'),
  ])
  const original = graph.size
  assert.throws(() => materializeProperties(graph, rdf, {maxInferredQuads: 1}), /inferred quad budget/)
  assert.equal(graph.size, original + 1)
})

function chain(predicates) {
  const graph = rdf.dataset([quad('inferred', OWL + 'propertyChainAxiom', 'list0')])
  predicates.forEach((predicate, i) => {
    graph.add(quad('list' + i, RDF + 'first', predicate))
    graph.add(quad('list' + i, RDF + 'rest', i === predicates.length - 1 ? RDF + 'nil' : 'list' + (i + 1)))
  })
  return graph
}

test('single-property chain paths are bounded before inference', () => {
  const graph = chain(['p'])
  graph.add(quad('first', 'p', 'object'))
  graph.add(quad('second', 'p', 'object'))
  assert.throws(() => materializeProperties(graph, rdf, {maxPaths: 1}), /path budget/)
  assert.equal(graph.match(null, node('inferred')).size, 0)
})

test('chain joins are bounded while enumerating their output', () => {
  const graph = chain(['p', 'q'])
  graph.add(quad('start', 'p', 'middle'))
  graph.add(quad('middle', 'q', 'first'))
  graph.add(quad('middle', 'q', 'second'))
  assert.throws(() => materializeProperties(graph, rdf, {maxPaths: 1}), /path budget/)
  assert.equal(graph.match(null, node('inferred')).size, 0)
  materializeProperties(graph, rdf, {maxPaths: 2, maxInferredQuads: 2})
  assert.ok(graph.has(quad('start', 'inferred', 'first')))
  assert.ok(graph.has(quad('start', 'inferred', 'second')))
  assert.equal(graph.match(null, node('inferred')).size, 2)
})
