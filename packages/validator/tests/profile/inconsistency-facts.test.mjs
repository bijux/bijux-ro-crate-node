import test from 'node:test'
import assert from 'node:assert/strict'
import rdf from 'rdf-validate-shacl/src/defaultEnv.js'
import {inferenceDataset, RDF, OWL} from '../../src/profile/inference/dataset.js'
import {inconsistencyMessages, emitInconsistencies, ERROR} from '../../src/profile/inference/errors.js'
const n = value => rdf.namedNode(value)

test('error nodes are plain-string graph facts emitted after inference and avoid existing blank nodes', () => {
  const old = rdf.blankNode('owl-error-0')
  const graph = rdf.dataset([rdf.quad(old, n(RDF + 'type'), n(ERROR + 'ErrorMessage')),
    rdf.quad(n('urn:p'), n(RDF + 'type'), n(OWL + 'IrreflexiveProperty')),
    rdf.quad(n('urn:a'), n('urn:p'), n('urn:a'))])
  const inference = inferenceDataset(graph, rdf)
  const messages = inconsistencyMessages(inference)
  assert.deepEqual([...messages], ['Irreflexive property used on urn:a with urn:p'])
  const emitted = emitInconsistencies(inference, rdf, messages)
  assert.equal(emitted[0].node, 'owl-error--0')
  assert.equal(inference.objects(rdf.blankNode(emitted[0].node), ERROR + 'error')[0].datatype.value, '')
  assert.equal(inference.has(rdf.blankNode(emitted[0].node), RDF + 'type', n(ERROR + 'ErrorMessage')), true)
  assert.equal(inference.has(rdf.blankNode(emitted[0].node), OWL + 'sameAs', rdf.blankNode(emitted[0].node)), false)
  assert.equal(inference.has(old, RDF + 'type', n(ERROR + 'ErrorMessage')), true)
})
test('error facts consume the shared quad budget', () => {
  const inference = inferenceDataset(rdf.dataset(), rdf, {maxInferredQuads: 1})
  assert.throws(() => emitInconsistencies(inference, rdf, new Set(['inconsistency'])), /quad budget/)
})
test('error identity sorts normalized messages independently of the physical crate root', () => {
  const a = inferenceDataset(rdf.dataset(), rdf), b = inferenceDataset(rdf.dataset(), rdf)
  const physical = 'file:///capture/location/'
  const left = emitInconsistencies(a, rdf, new Set(['two file:///crate/a', 'one file:///crate/b']))
  const right = emitInconsistencies(b, rdf, new Set(['one ' + physical + 'b', 'two ' + physical + 'a']), physical)
  assert.deepEqual(left.map(x => x.node), right.map(x => x.node))
  assert.deepEqual(left.map(x => x.message.replaceAll('file:///crate/', 'crate:/')),
    right.map(x => x.message.replaceAll(physical, 'crate:/')))
})

test('generated labels follow Python Unicode code-point order', () => {
  const inference = inferenceDataset(rdf.dataset(), rdf)
  const values = ['message \u{10000}', 'message \ue000']
  const emitted = emitInconsistencies(inference, rdf, new Set(values))
  assert.deepEqual(emitted.map(item => item.message), [values[1], values[0]])
})
