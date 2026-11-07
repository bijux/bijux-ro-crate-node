import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {canonicalLiteral} from '../../src/metadata/rdf/literals/canonical.js'
import {literalKey} from '../../src/metadata/rdf/literals/identity.js'
import {rdfDataset} from '../../src/metadata/rdf/dataset.js'

const oracle = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/literal-identities.json', import.meta.url)))
const reference = JSON.parse(await readFile(new URL('../../../../docs/compatibility/reference.json', import.meta.url)))
assert.equal(oracle.reference, reference.commit)
const literal = (value, datatype) => ({termType: 'Literal', value, language: '',
  datatype: {termType: 'NamedNode', value: 'http://www.w3.org/2001/XMLSchema#' + datatype}})
for (const type of new Set(oracle.values.map(c => c.datatype))) {
  test('literal lexical identity captured from RDFLib: ' + type, () => {
    for (const c of oracle.values.filter(c => c.datatype === type)) {
      if (c.error) assert.throws(() => canonicalLiteral(literal(c.input, type)), c.input)
      else {
        assert.equal(canonicalLiteral(literal(c.input, type)), c.canonical, JSON.stringify(c))
        assert.equal(literalKey(literal(c.input, type)), literalKey(literal(c.canonical, type)), c.input)
      }
    }
  })
}
test('equivalent instants with distinct offsets remain distinct RDF terms', () => {
  assert.notEqual(literalKey(literal('2024-01-01T00:00:00Z', 'dateTime')),
    literalKey(literal('2024-01-01T01:00:00+01:00', 'dateTime')))
})
test('datatype boundaries remain part of literal identity', () => {
  assert.notEqual(literalKey(literal('P1D', 'duration')), literalKey(literal('PT24H', 'dayTimeDuration')))
})
test('RDF graph conversion normalizes literal objects before inference', async () => {
  const quads = await rdfDataset({'@id': 'urn:subject', 'urn:property': [
    {'@value': 'Aa', '@type': literal('', 'hexBinary').datatype.value},
    {'@value': '2024-01-01T00:00:00Z', '@type': literal('', 'dateTime').datatype.value},
  ]})
  assert.deepEqual(quads.map(q => q.object.value).sort(), ['2024-01-01T00:00:00+00:00', 'aa'])
})
