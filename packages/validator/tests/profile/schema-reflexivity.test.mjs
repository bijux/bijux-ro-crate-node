import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import {validateCrate} from '../../src/index.js'
import {readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
import test from 'node:test'
import rdf from 'rdf-validate-shacl/src/defaultEnv.js'
import {inferenceDataset,RDF,RDFS,OWL} from '../../src/profile/inference/dataset.js'
import {classRules} from '../../src/profile/inference/classes.js'
import {propertyRules} from '../../src/profile/inference/properties.js'
import {schemaRules} from '../../src/profile/inference/schema.js'
const n = value => rdf.namedNode(value)
const a = n('urn:relation:a'), b = n('urn:relation:b')
function infer(rows) {
  const graph=rdf.dataset(rows.map(([s,p,o])=>rdf.quad(s,n(p),o)))
  const result=inferenceDataset(graph,rdf)
  result.close([classRules,propertyRules,schemaRules])
  return result
}
for (const [relation,equivalent] of [[RDFS+'subClassOf',OWL+'equivalentClass'],[RDFS+'subPropertyOf',OWL+'equivalentProperty']])
  test('a '+relation+' cycle preserves equivalence without inventing reflexive edges',()=>{
    const graph=infer([[a,relation,b],[b,relation,a]])
    assert.equal(graph.has(a,relation,a),false)
    assert.equal(graph.has(b,relation,b),false)
    assert.equal(graph.has(a,equivalent,b),true)
    assert.equal(graph.has(b,equivalent,a),true)
  })
test('an untyped self-subproperty does not imply schema equivalence',()=>{
  const graph=infer([[a,RDFS+'subPropertyOf',a]])
  assert.equal(graph.has(a,RDFS+'subPropertyOf',a),true)
  assert.equal(graph.has(a,OWL+'equivalentProperty',a),false)
})
for (const type of [OWL+'ObjectProperty',OWL+'DatatypeProperty',RDF+'Property'])
  test(type+' retains its type-driven reflexive axioms',()=>{
    const graph=infer([[a,RDF+'type',n(type)]])
    assert.equal(graph.has(a,RDFS+'subPropertyOf',a),true)
    assert.equal(graph.has(a,OWL+'equivalentProperty',a),true)
  })
test('a declared OWL class retains its type-driven reflexive axioms',()=>{
  const graph=infer([[a,RDF+'type',n(OWL+'Class')]])
  assert.equal(graph.has(a,RDFS+'subClassOf',a),true)
  assert.equal(graph.has(a,OWL+'equivalentClass',a),true)
})

const {cases} = JSON.parse(await readFile(new URL('../../../../tests/parity/inputs/profile-schema-reflexivity.json', import.meta.url)))
const expected = new Map(JSON.parse(await readFile(new URL('../../../../tests/parity/expected/crates.json', import.meta.url))).cases.map(row=>[row.name,row]))
for (const item of cases) test(item.name + ' preserves the complete required-profile report', async()=>{
  const wanted=expected.get(item.name)
  assertInputBytes(item,wanted)
  compareResult(await validateCrate(new Map(Object.entries(item.files)),
    {contexts:new Map(Object.entries(item.contexts??{}))}),wanted,item.name)
})
