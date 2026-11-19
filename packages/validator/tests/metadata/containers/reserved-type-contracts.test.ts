import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../../src/index.js'
import type {ValidationReport} from '../../../src/index.js'
import {cases,assertResult,assertCapture,originalByName,approvedDifferences} from '../../../../../tests/reference/reserved-type-identifiers/observers/checks.mjs'
type Case = typeof cases[number]
type Capture = Parameters<typeof assertCapture>[0]
type CorrectedCapture = Capture & {reserved_type_correction: NonNullable<Capture['reserved_type_correction']>; cases: Array<Capture['cases'][number] & {report: ValidationReport}>}
type Result = {status: unknown; report: ValidationReport; reason?: string}
const folder=new URL('../../../../../tests/reference/reserved-type-identifiers/observers/',import.meta.url)
const original: Capture=JSON.parse(await readFile(new URL('original.json',folder),'utf8'))
const corrected: CorrectedCapture=JSON.parse(await readFile(new URL('corrected.json',folder),'utf8'))
const registered=structuredClone(cases)
const result=(index: number): Result=>({status:corrected.cases[index].status,report:structuredClone(corrected.cases[index].report)})
for(const [index,item]of registered.entries())test(item.name+' preserves its complete independently corrected outcome',async()=>{
 const actual=await validateCrate(new Map(Object.entries(item.files)),{contexts:new Map(Object.entries(item.contexts??{}))})
 assertResult(item,actual)
 assertResult(item,result(index))
})
test('reserved-type contracts reject input and full-result mutations',()=>{
 let rejected=0
 for(const [index,item]of registered.entries()){
  for(const mutate of [(x: Case)=>x.name+='-unknown',(x: Case)=>x.files['ro-crate-metadata.json']+=' ',(x: Case)=>x.files.extra='unregistered',(x: Case)=>x.contexts={'https://example.org/other':{'@context':{}}}]){
   const changed=structuredClone(item);mutate(changed);assert.throws(()=>assertResult(changed,result(index)));rejected++
  }
  for(const mutate of [(x: Result)=>x.status='valid',(x: Result)=>x.report.highest_error_level=null,(x: Result)=>x.report.issues.ERROR.pop(),(x: Result)=>x.report.issues.INFO.push({message:'extra',severity:20,location_description:null}),(x: Result)=>x.reason='unexpected']){
   const changed=result(index);mutate(changed);assert.throws(()=>assertResult(item,changed));rejected++
  }
 }
 assert.equal(rejected,54)
})
test('reserved-type captures reject report, source, scope and call mutations',()=>{
 assertCapture(original,'original');assertCapture(corrected,'corrected')
 for(const mutate of [(x: CorrectedCapture)=>x.cases.pop(),(x: CorrectedCapture)=>x.cases[0].name+='-unknown',(x: CorrectedCapture)=>x.cases[0].inputs_sha256['ro-crate-metadata.json']='0'.repeat(64),(x: CorrectedCapture)=>x.cases[0].report.issues.ERROR.pop(),(x: CorrectedCapture)=>x.cases[0].exception=null,(x: CorrectedCapture)=>x.reserved_type_correction.reference.functions.profile_data_graph='0'.repeat(64),(x: CorrectedCapture)=>x.reserved_type_correction.observations.pop(),(x: CorrectedCapture)=>x.reserved_type_correction.observations[0].role='other',(x: CorrectedCapture)=>x.reserved_type_correction.observations[0].counterpart_sha256='0'.repeat(64)]){
  const changed=structuredClone(corrected);mutate(changed);assert.throws(()=>assertCapture(changed,'corrected'))
 }
})
test('exported observer data cannot rewrite private registration or expectations',()=>{
 const saved=cases[0].files['ro-crate-metadata.json']
 try{cases[0].files['ro-crate-metadata.json']+=' ';assert.throws(()=>assertResult(cases[0],result(0)));assertResult(registered[0],result(0))}
 finally{cases[0].files['ro-crate-metadata.json']=saved}
 const observed=originalByName.get(registered[0].name)
 const exportedViews: Map<string, unknown> = originalByName
 exportedViews.set(registered[0].name,{status:'valid'})
 const savedDifferences=[...approvedDifferences];approvedDifferences.clear()
 try{assertResult(registered[0],result(0));assertCapture(corrected,'corrected')}
 finally{originalByName.set(registered[0].name,observed!);for(const name of savedDifferences)approvedDifferences.add(name)}
})
