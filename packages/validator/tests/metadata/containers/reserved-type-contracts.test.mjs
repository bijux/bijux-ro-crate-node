import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../../src/index.js'
import {cases,assertResult,assertCapture,originalByName,approvedDifferences} from '../../../../../tests/reference/reserved-type-identifiers/observers/checks.mjs'
const folder=new URL('../../../../../tests/reference/reserved-type-identifiers/observers/',import.meta.url)
const original=JSON.parse(await readFile(new URL('original.json',folder)))
const corrected=JSON.parse(await readFile(new URL('corrected.json',folder)))
const registered=structuredClone(cases)
const result=index=>({status:corrected.cases[index].status,report:structuredClone(corrected.cases[index].report)})
for(const [index,item]of registered.entries())test(item.name+' preserves its complete independently corrected outcome',async()=>{
 const actual=await validateCrate(new Map(Object.entries(item.files)),{contexts:new Map(Object.entries(item.contexts??{}))})
 assertResult(item,actual)
 assertResult(item,result(index))
})
test('reserved-type contracts reject input and full-result mutations',()=>{
 let rejected=0
 for(const [index,item]of registered.entries()){
  for(const mutate of [x=>x.name+='-unknown',x=>x.files['ro-crate-metadata.json']+=' ',x=>x.files.extra='unregistered',x=>x.contexts={'https://example.org/other':{'@context':{}}}]){
   const changed=structuredClone(item);mutate(changed);assert.throws(()=>assertResult(changed,result(index)));rejected++
  }
  for(const mutate of [x=>x.status='valid',x=>x.report.highest_error_level=null,x=>x.report.issues.ERROR.pop(),x=>x.report.issues.INFO.push({message:'extra',severity:20,location_description:null}),x=>x.reason='unexpected']){
   const changed=result(index);mutate(changed);assert.throws(()=>assertResult(item,changed));rejected++
  }
 }
 assert.equal(rejected,54)
})
test('reserved-type captures reject report, source, scope and call mutations',()=>{
 assertCapture(original,'original');assertCapture(corrected,'corrected')
 for(const mutate of [x=>x.cases.pop(),x=>x.cases[0].name+='-unknown',x=>x.cases[0].inputs_sha256['ro-crate-metadata.json']='0'.repeat(64),x=>x.cases[0].report.issues.ERROR.pop(),x=>x.cases[0].exception=null,x=>x.reserved_type_correction.reference.functions.profile_data_graph='0'.repeat(64),x=>x.reserved_type_correction.observations.pop(),x=>x.reserved_type_correction.observations[0].role='other',x=>x.reserved_type_correction.observations[0].counterpart_sha256='0'.repeat(64)]){
  const changed=structuredClone(corrected);mutate(changed);assert.throws(()=>assertCapture(changed,'corrected'))
 }
})
test('exported observer data cannot rewrite private registration or expectations',()=>{
 const saved=cases[0].files['ro-crate-metadata.json']
 try{cases[0].files['ro-crate-metadata.json']+=' ';assert.throws(()=>assertResult(cases[0],result(0)));assertResult(registered[0],result(0))}
 finally{cases[0].files['ro-crate-metadata.json']=saved}
 const observed=originalByName.get(registered[0].name)
 originalByName.set(registered[0].name,{status:'valid'})
 const savedDifferences=[...approvedDifferences];approvedDifferences.clear()
 try{assertResult(registered[0],result(0));assertCapture(corrected,'corrected')}
 finally{originalByName.set(registered[0].name,observed);for(const name of savedDifferences)approvedDifferences.add(name)}
})
