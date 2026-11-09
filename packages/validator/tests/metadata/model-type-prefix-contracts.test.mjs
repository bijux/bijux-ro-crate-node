import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {cases,assertResult,assertCapture,originalByName,approvedDifferences} from '../../../../tests/reference/model-type-prefixes/checks.mjs'
const folder=new URL('../../../../tests/reference/model-type-prefixes/',import.meta.url)
const original=JSON.parse(await readFile(new URL('original.json',folder))),corrected=JSON.parse(await readFile(new URL('corrected.json',folder)))
const registered=structuredClone(cases),results=new Map()
for(const item of registered){const actual=await validateCrate(new Map(Object.entries(item.files)),{contexts:new Map(Object.entries(item.contexts??{}))});results.set(item.name,actual)}
for(const item of registered)test(item.name+' retains its independently qualified outcome',()=>assertResult(item,results.get(item.name)))
test('model-type prefix contracts refuse changed input bytes, contexts and results',()=>{
 let rejected=0
 for(const item of registered){
  for(const mutate of[x=>x.name+='-unknown',x=>x.files['ro-crate-metadata.json']+=' ',x=>x.files.extra='extra',x=>x.contexts={'https://example.org/other':{'@context':{}}}]){
   const value=structuredClone(item);mutate(value);assert.throws(()=>assertResult(value,results.get(item.name)));rejected++
  }
  for(const mutate of[x=>x.status=x.status==='valid'?'invalid':'valid',x=>x.report.highest_error_level=x.report.highest_error_level===null?'ERROR':null,x=>x.report.issues.INFO.push({message:'extra',severity:20,location_description:null})]){
   const value=structuredClone(results.get(item.name));mutate(value);assert.throws(()=>assertResult(item,value));rejected++
  }
 }
 assert.equal(rejected,140)
 for(const item of registered.filter(row=>row.name.includes('/unflattened-map/')))for(const field of['stage','reason']){
  const value=structuredClone(results.get(item.name));value[field]='other';assert.throws(()=>assertResult(item,value))
 }
})
test('model-type capture contracts bind all reports, proof calls and original bytes',()=>{
 assertCapture(original,'original');assertCapture(corrected,'corrected')
 for(const mutate of[x=>x.cases.pop(),x=>x.cases[0].name+='-unknown',x=>x.cases[0].inputs_sha256['ro-crate-metadata.json']='0'.repeat(64),x=>x.cases[0].report.issues.ERROR.pop(),x=>x.cases[0].exception=null,x=>x.model_type_prefix_correction.reference.functions.parse_context='0'.repeat(64),x=>x.model_type_prefix_correction.observations.pop(),x=>x.model_type_prefix_correction.observations[0].identities[0].types.push('urn:changed')]){
  const value=structuredClone(corrected);mutate(value);assert.throws(()=>assertCapture(value,'corrected'))
 }
})
test('exported model-type data cannot rewrite private correction contracts',()=>{
 const saved=cases[0].files['ro-crate-metadata.json'],old=originalByName.get(registered[0].name),differences=[...approvedDifferences]
 try{
  cases[0].files['ro-crate-metadata.json']+=' ';assert.throws(()=>assertResult(cases[0],results.get(registered[0].name)))
  originalByName.set(registered[0].name,{status:'valid'});approvedDifferences.clear()
  assertResult(registered[0],results.get(registered[0].name));assertCapture(corrected,'corrected')
 }finally{cases[0].files['ro-crate-metadata.json']=saved;originalByName.set(registered[0].name,old);for(const name of differences)approvedDifferences.add(name)}
})
