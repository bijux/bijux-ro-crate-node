import assert from 'node:assert/strict'
import test from 'node:test'
import rdf from 'rdf-validate-shacl/src/defaultEnv.js'
import {inferenceDataset, RDF} from '../../src/profile/inference/dataset.js'

const node = value => rdf.namedNode('https://example.test/' + value)
const nil = rdf.namedNode(RDF + 'nil')
function fixture(options) {
  const inference = inferenceDataset(rdf.dataset(), rdf, options)
  const first = (cell, value) => inference.add(cell, RDF + 'first', value)
  const rest = (cell, tail) => inference.add(cell, RDF + 'rest', tail)
  return {inference, first, rest}
}

for (const [name, head] of [
  ['empty string', rdf.literal('')], ['language-tagged empty string', rdf.literal('', 'en')],
  ['zero integer', rdf.literal('0', rdf.namedNode('http://www.w3.org/2001/XMLSchema#integer'))],
  ['false boolean', rdf.literal('false', rdf.namedNode('http://www.w3.org/2001/XMLSchema#boolean'))],
  ['zero duration', rdf.literal('P0D', rdf.namedNode('http://www.w3.org/2001/XMLSchema#duration'))],
  ['empty binary', rdf.literal('', rdf.namedNode('http://www.w3.org/2001/XMLSchema#hexBinary'))],
  ['named node', node('head')], ['blank node', rdf.blankNode('head')],
]) test('complete collection retains ' + name + ' cell identity', () => {
  const {inference, first, rest} = fixture()
  first(head, node('member')); rest(head, nil)
  assert.deepEqual(inference.collection(head).members(), [node('member')])
})

for (const [name, head, tail] of [
  ['false-valued tail', node('head'), rdf.literal('')],
  ['datatype-distinct cells', rdf.literal('0', rdf.namedNode('http://www.w3.org/2001/XMLSchema#integer')),
    rdf.literal('0', rdf.namedNode('http://www.w3.org/2001/XMLSchema#decimal'))],
  ['language-distinct cells', rdf.literal('', 'en'), rdf.literal('', 'fr')],
]) test('complete collection preserves ' + name, () => {
  const {inference, first, rest} = fixture()
  first(head, node('p')); rest(head, tail)
  first(tail, node('q')); rest(tail, nil)
  assert.deepEqual(inference.collection(head).members(), [node('p'), node('q')])
})

test('a missing first or rest cannot contribute a partial rule antecedent', () => {
  const {inference, first, rest} = fixture()
  first(node('no-tail'), node('member'))
  rest(node('no-first'), node('no-tail'))
  assert.deepEqual(inference.collection(node('no-tail')).members(), [])
  assert.deepEqual(inference.collection(node('no-first')).members(), [])
  assert.deepEqual(inference.collection(null).members(), [])
})

test('a cyclic suffix invalidates the whole candidate instead of returning a prefix', () => {
  const {inference, first, rest} = fixture()
  first(node('head'), node('p')); rest(node('head'), node('tail'))
  first(node('tail'), node('q')); rest(node('tail'), node('head'))
  assert.deepEqual(inference.collection(node('head')).members(), [])
})

test('incomplete branches do not hide a unique complete witness', () => {
  const {inference, first, rest} = fixture()
  first(node('head'), node('p'))
  rest(node('head'), node('dead')); rest(node('head'), nil)
  first(node('dead'), node('q'))
  assert.deepEqual(inference.collection(node('head')).members(), [node('p')])
})

test('multiple complete branches expose all productive members', () => {
  for (const reversed of [false, true]) {
    const {inference, first, rest} = fixture()
    first(node('head'), node('p'))
    for (const tail of reversed ? [nil, node('tail')] : [node('tail'), nil]) rest(node('head'), tail)
    first(node('tail'), node('q')); rest(node('tail'), nil)
    assert.deepEqual(inference.collection(node('head')).members(), [node('p'), node('q')])
  }
})

test('a cycle with a terminating exit retains its productive members', () => {
  const {inference, first, rest} = fixture()
  first(node('head'), node('p')); rest(node('head'), node('head')); rest(node('head'), nil)
  assert.deepEqual(inference.collection(node('head')).members(), [node('p')])
})

test('rdf:nil remains empty when its extra arcs cannot complete a nonempty witness', () => {
  const {inference, first, rest} = fixture()
  assert.deepEqual(inference.collection(nil).members(), [])
  first(nil, node('ignored'))
  assert.deepEqual(inference.collection(nil).members(), [])
  rest(nil, node('dead'))
  assert.deepEqual(inference.collection(nil).members(), [])
  first(node('head'), node('p')); rest(node('head'), nil)
  assert.deepEqual(inference.collection(node('head')).members(), [node('p')])
})

test('a described rdf:nil retains every productive nonempty member', () => {
  const {inference, first, rest} = fixture()
  first(nil, node('p')); rest(nil, nil)
  assert.deepEqual(inference.collection(nil).members(), [node('p')])
  first(node('head'), node('q')); rest(node('head'), nil)
  assert.deepEqual(inference.collection(node('head')).members(), [node('q'), node('p')])
})

test('member and branch exploration obey the same finite path budget', () => {
  const {inference, first, rest} = fixture({maxPaths: 1})
  first(node('head'), node('p')); rest(node('head'), node('tail'))
  first(node('tail'), node('q')); rest(node('tail'), nil)
  assert.throws(() => inference.collection(node('head')).members(), /path budget/)
  const branch = fixture({maxPaths: 1})
  branch.first(node('head'), node('p'))
  branch.rest(node('head'), nil); branch.rest(node('head'), node('other'))
  assert.throws(() => branch.inference.collection(node('head')).members(), /path budget/)
})
