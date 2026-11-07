import assert from 'node:assert/strict';
import test from 'node:test';
import { rdfDataset } from '../../src/metadata/rdf/dataset.js';

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

const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
for (const [name, value, datatype, context] of [
  ['plain string', 'value', '', {}],
  ['untyped value object', {'@value': 'value'}, '', {}],
  ['explicit typed string', {'@value': 'value', '@type': XSD_STRING}, XSD_STRING, {}],
  ['context-coerced string', 'value', XSD_STRING, {'urn:property': {'@id': 'urn:property', '@type': XSD_STRING}}],
]) {
  test('RDFLib datatype identity: ' + name, async () => {
    const quads = await rdfDataset({'@context': context, '@id': 'urn:subject', 'urn:property': value});
    assert.equal(quads.length, 1);
    assert.equal(quads[0].object.value, 'value');
    assert.equal(quads[0].object.datatype.value, datatype);
  });
}

test('plain and explicit typed strings remain distinct objects of the same property', async () => {
  const quads = await rdfDataset({'@id': 'urn:subject', 'urn:property': [
    'value', {'@value': 'value', '@type': XSD_STRING},
  ]});
  assert.equal(quads.length, 2);
  assert.deepEqual(quads.map(q => q.object.datatype.value).sort(), ['', XSD_STRING]);
});
