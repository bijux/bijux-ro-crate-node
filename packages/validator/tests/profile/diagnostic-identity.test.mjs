import assert from 'node:assert/strict'
import test from 'node:test'
import rdf from 'rdf-validate-shacl/src/defaultEnv.js'
import {withNamespaces} from '../../src/metadata/rdf/namespaces.js'
import {inversePathFormatter} from '../../src/profile/diagnostics/inverse-path.js'

const sameAs = 'http://www.w3.org/2002/07/owl#sameAs'
const label = 'http://www.w3.org/2000/01/rdf-schema#label'
const child = 'https://example.org/child'
function formatter(quads) {
  return inversePathFormatter({graph: rdf.dataset(quads), list() {throw new Error('Not a collection')}}, withNamespaces([], {format: value => '<' + value + '>'}), 'file:///selected/')
}
function clone(quad) {return rdf.quad(rdf.fromTerm(quad.subject), rdf.fromTerm(quad.predicate), rdf.fromTerm(quad.object))}

test('RDF-equal focus and predicate objects have identical self-equality diagnostics', () => {
  const node = rdf.blankNode('focus')
  const quads = [rdf.quad(node, rdf.namedNode(sameAs), node), rdf.quad(node, rdf.namedNode(label), rdf.literal('same logical node'))]
  const original = formatter(quads)(node)
  assert.ok(original.includes('<self>'))
  assert.equal(formatter(quads)(rdf.blankNode('focus')), original)
  assert.equal(formatter(quads.map(clone).reverse())(rdf.blankNode('focus')), original)
})

test('cyclic diagnostics are independent of focus order and graph insertion order', () => {
  const left = rdf.blankNode('left'), right = rdf.blankNode('right')
  const quads = [rdf.quad(left, rdf.namedNode(sameAs), left), rdf.quad(right, rdf.namedNode(sameAs), right),
    rdf.quad(left, rdf.namedNode(child), right), rdf.quad(right, rdf.namedNode(child), left)]
  const forward = formatter(quads), backward = formatter(quads.map(clone).reverse())
  const a = forward(left), b = forward(right)
  assert.equal(backward(right), b)
  assert.equal(backward(left), a)
  assert.equal(a, b)
})
