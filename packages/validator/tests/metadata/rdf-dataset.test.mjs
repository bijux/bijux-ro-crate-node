import assert from 'node:assert/strict';
import test from 'node:test';
import { rdfDataset } from '../../src/metadata/rdf/dataset.js';
import { referenceDatatype } from '../../src/metadata/rdf/literals/datatype-aliases.js';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
for (const [input, lexical] of [[7, '7'], [true, 'true']]) {
  test(`RDFLib malformed type literal ${input}`, async () => {
    const quads = await rdfDataset({ '@graph': [{ '@id': '#entity', '@type': input }] });
    assert.equal(quads.length, 1);
    assert.equal(quads[0].predicate.value, RDF_TYPE);
    assert.equal(quads[0].object.termType, 'Literal');
    assert.equal(quads[0].object.value, lexical);
    assert.equal(referenceDatatype(quads, quads[0].object), '');
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

for (const key of ['__proto__', 'hasOwnProperty', 'constructor', 'toString']) {
  test('context and entity preserve the own term ' + key, async () => {
    const document = JSON.parse(JSON.stringify({
      '@context': {[key]: 'urn:property'}, '@id': 'urn:subject', [key]: 'value',
    }));
    const before = JSON.stringify(document);
    const prototypeKeys = Object.getOwnPropertyNames(Object.prototype);
    const quads = await rdfDataset(document);
    assert.equal(quads.length, 1);
    assert.equal(quads[0].predicate.value, 'urn:property');
    assert.equal(quads[0].object.value, 'value');
    assert.equal(JSON.stringify(document), before);
    assert.deepEqual(Object.getOwnPropertyNames(Object.prototype), prototypeKeys);
  });
}
