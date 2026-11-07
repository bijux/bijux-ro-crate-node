import assert from 'node:assert/strict';
import test from 'node:test';
import { rdfDataset } from '../../packages/validator/src/metadata/rdf/dataset.js';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
for (const [input, lexical] of [[7, '7'], [true, 'true']]) {
  test(`RDFLib malformed type literal ${input}`, async () => {
    const quads = await rdfDataset({ '@graph': [{ '@id': '#entity', '@type': input }] });
    assert.equal(quads.length, 1);
    assert.equal(quads[0].predicate.value, RDF_TYPE);
    assert.deepEqual(quads[0].object, { termType: 'Literal', value: lexical, datatype: { termType: 'NamedNode', value: '' } });
  });
}
test('RDFLib object type contributes a blank type node', async () => {
  const quads = await rdfDataset({ '@graph': [{ '@id': '#entity', '@type': {} }] });
  assert.equal(quads.length, 1);
  assert.equal(quads[0].predicate.value, RDF_TYPE);
  assert.equal(quads[0].object.termType, 'BlankNode');
});
