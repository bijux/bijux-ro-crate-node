import assert from 'node:assert/strict'
import test from 'node:test'
import rdf from 'rdf-validate-shacl/src/defaultEnv.js'
import SHACLValidator from 'rdf-validate-shacl'

const n = value => rdf.namedNode(value)
const SH = 'http://www.w3.org/ns/shacl#'
const XSD = 'http://www.w3.org/2001/XMLSchema#'
const TYPE = n('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')

test('plain and typed strings remain distinct while both satisfy string constraints', async () => {
  const data = rdf.dataset([
    rdf.quad(n('urn:subject'), n('urn:property'), rdf.literal('value', n(''))),
    rdf.quad(n('urn:subject'), n('urn:property'), rdf.literal('value', n(XSD + 'string'))),
  ])
  const shapes = rdf.dataset([
    rdf.quad(n('urn:shape'), n(SH + 'targetNode'), n('urn:subject')),
    rdf.quad(n('urn:shape'), n(SH + 'property'), n('urn:constraint')),
    rdf.quad(n('urn:constraint'), n(SH + 'path'), n('urn:property')),
    rdf.quad(n('urn:constraint'), n(SH + 'minCount'), rdf.literal('2', n(XSD + 'integer'))),
    rdf.quad(n('urn:constraint'), n(SH + 'datatype'), n(XSD + 'string')),
  ])
  assert.equal((await new SHACLValidator(shapes).validate(data)).conforms, true)
  for (const {object} of [...data]) data.add(rdf.quad(object, TYPE, n('urn:Class')))
  shapes.delete(rdf.quad(n('urn:constraint'), n(SH + 'datatype'), n(XSD + 'string')))
  shapes.add(rdf.quad(n('urn:constraint'), n(SH + 'class'), n('urn:Class')))
  assert.equal((await new SHACLValidator(shapes).validate(data)).conforms, false)
})
