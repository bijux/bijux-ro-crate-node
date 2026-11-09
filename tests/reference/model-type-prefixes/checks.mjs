import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {compareResult} from '../../parity/compare.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'
const read=async name=>JSON.parse(await readFile(new URL(name,import.meta.url)))
const hash=value=>createHash('sha256').update(value).digest('hex')
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
const registeredCases=freeze((await read('./inputs.json')).cases)
const registered=new Map(registeredCases.map(item=>[item.name,item]))
const original=freeze(await read('./original.json')),corrected=freeze(await read('./corrected.json'))
const originalMap=new Map(original.cases.map(item=>[item.name,item])),correctedMap=new Map(corrected.cases.map(item=>[item.name,item]))
const variants=['root-publication','root-dataset','contributor-publication','contributor-study','filelist-publication']
const pairs=freeze((await read('./counterparts.json')).pairs)
assert.deepEqual(pairs,variants.map(name=>({original:'model-type-prefixes/aliased-model/'+name,counterpart:'model-type-prefixes/expanded-model/'+name})))
const correctedNames=new Set([...pairs.map(pair=>pair.original),'model-type-prefixes/single-model-alias'])
const source=await read('./correction.json'),proof=await read('./proof.json')
const pin=await read('../../../docs/compatibility/reference.json')
const correction={...source,observations:corrected.model_type_prefix_correction.observations,
 capture_sha256:hash(await readFile(new URL('./capture.py',import.meta.url))),
 correction_sha256:hash(await readFile(new URL('./corrected.py',import.meta.url)))}
for(const[name,key]of[['inputs.json','inputs_sha256'],['counterparts.json','counterparts_sha256'],['proof.json','proof_sha256'],['prove.py','proof_source_sha256']])assert.equal(hash(await readFile(new URL(name,import.meta.url))),source[key])
for(const map of[registered,originalMap,correctedMap])assert.equal(map.size,20)
assert.equal(registeredCases.length,20)
export const cases=structuredClone(registeredCases)
export const originalByName=new Map(structuredClone(originalMap))
export const approvedDifferences=new Set(correctedNames)
export const reference=Object.freeze({reference:pin.commit,suite_sha256:hash(JSON.stringify(registeredCases))})
export function assertCapture(value,mode){
 assert.ok(mode==='original'||mode==='corrected')
 assert.deepEqual(value,mode==='original'?original:corrected)
 assert.equal(value.commit,pin.commit)
 assert.equal(value.corpus_sha256,hash(JSON.stringify(registeredCases)))
 assert.deepEqual(value.cases.map(item=>item.name),registeredCases.map(item=>item.name))
 for(const[index,item]of registeredCases.entries())assertInputBytes(item,value.cases[index])
 if(mode==='corrected')assert.deepEqual(value.model_type_prefix_correction,correction)
}
assertCapture(original,'original');assertCapture(corrected,'corrected')
const{cases:_oldCases,...oldMetadata}=original
const{cases:_fixedCases,model_type_prefix_correction:_stamp,...fixedMetadata}=corrected
assert.deepEqual(oldMetadata,fixedMetadata)
assert.deepEqual(correction.observations.map(row=>row.name),registeredCases.map(row=>row.name))
const stripIdentity=({name:_name,inputs_sha256:_hashes,...value})=>value
for(const pair of pairs){
 const before=originalMap.get(pair.original),after=correctedMap.get(pair.original),counterpart=originalMap.get(pair.counterpart)
 assert.equal(before.status,'valid');assert.equal(after.status,'invalid')
 assert.deepEqual(stripIdentity(after),stripIdentity(counterpart))
}
const diagnostic=correctedMap.get('model-type-prefixes/single-model-alias')
assert.equal(originalMap.get(diagnostic.name).status,'invalid');assert.equal(diagnostic.status,'invalid')
assert.notDeepEqual(diagnostic.report,originalMap.get(diagnostic.name).report)
assert.equal(diagnostic.report.issues.ERROR.length,1)
assert.equal(diagnostic.report.issues.ERROR[0].message,proof.single_model_alias.rendered_messages.join('\n'))
assert.equal(diagnostic.report.issues.ERROR[0].location_description,'At ro-crate object with @id: ./')
for(const item of registeredCases)if(!correctedNames.has(item.name))assert.deepEqual(originalMap.get(item.name),correctedMap.get(item.name))
const incompleteNames=new Set(registeredCases.filter(item=>item.name.includes('/unflattened-map/')).map(item=>item.name))
assert.equal(incompleteNames.size,6)
for(const name of incompleteNames)for(const map of[originalMap,correctedMap]){
 const row=map.get(name);assert.equal(row.status,'incomplete');assert.equal(row.exception.type,'JsonLdError')
 assert.ok(row.exception.message.includes('Invalid JSON-LD syntax; "@id" value must be a string.'))
 assert.ok(row.exception.message.includes('Code: invalid @id value'))
}
const expectedStatuses=new Map(corrected.cases.map(item=>[item.name,item.status]))
assert.deepEqual(corrected.cases.reduce((out,row)=>(out[row.status]++,out),{valid:0,invalid:0,incomplete:0}),{valid:2,invalid:12,incomplete:6})
export function assertResult(item,actual){
 assert.ok(registered.has(item.name),'Unregistered model-type prefix input')
 assert.deepEqual(item,registered.get(item.name));assert.equal(JSON.stringify(item),JSON.stringify(registered.get(item.name)))
 assertInputBytes(item,originalMap.get(item.name))
 assert.equal(actual.status,expectedStatuses.get(item.name))
 assert.deepEqual(Object.keys(actual).sort(),incompleteNames.has(item.name)?['reason','report','stage','status']:['report','status'])
 if(incompleteNames.has(item.name)){assert.equal(actual.stage,'metadata');assert.equal(actual.reason,'Invalid JSON-LD syntax; \"@id\" value must a string.')}
 compareResult(actual,correctedMap.get(item.name),item.name)
}
