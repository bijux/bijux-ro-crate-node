import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
const folder=new URL('../../../../tests/parity/fixtures/test_minimal_valid_ro_crate/',import.meta.url)
const source=await readFile(new URL('ro-crate-metadata.json',folder),'utf8')
const manifest=await readFile(new URL('file_list.tsv',folder),'utf8')
const validate=doc=>validateCrate(new Map([['ro-crate-metadata.json',JSON.stringify(doc)],['file_list.tsv',manifest]]))
for(const[name,index,type]of [['root-publication',1,'Publication'],['root-dataset',1,'Dataset'],['contributor-publication',2,'Publication'],['contributor-study',2,'Study'],['filelist-publication',3,'Publication']])test(name+' cannot hide a second model behind an explicit prefix',async()=>{
 const document=JSON.parse(source);document['@context'].push({lab:{'@id':'http://bia','@prefix':true}})
 document['@graph'][index]['@type'].push('lab:/'+type)
 const result=await validate(document)
 assert.equal(result.status,'invalid')
 assert.ok(result.report.issues.ERROR.some(issue=>issue.message.includes('matching 2 BIA classes.')))
})
test('one-model alias keeps its existing raw model-token refusal',async()=>{
 const document=JSON.parse(source);document['@context'].push({lab:{'@id':'http://bia','@prefix':true}})
 document['@graph'][1]['@type']=['Dataset','lab:/Study']
 const result=await validate(document);assert.equal(result.status,'invalid')
 assert.ok(result.report.issues.ERROR.some(issue=>issue.message.includes('Expected http://bia/Study, or bia:Study in types')))
})
test('unused explicit prefix and accepted raw full type retain valid uploads',async()=>{
 const document=JSON.parse(source);document['@context'].push({lab:{'@id':'http://bia','@prefix':true}})
 assert.equal((await validate(document)).status,'valid')
 document['@graph'][1]['@type']=['Dataset','http://bia/Study']
 assert.equal((await validate(document)).status,'valid')
})
for(const kind of ['@type','@index','@id'])for(const prefix of [false,true])test(kind+' map retains supported containers and refuses prefix value semantics: '+prefix,async()=>{
 const document=JSON.parse(source)
 document['@context'].push({p:{'@id':'urn:p','@container':kind,...(prefix?{'@prefix':true}:{})},q:'urn:q'})
 document['@graph'][1].p={'@id':{'@id':'urn:b','@type':['http://schema.org/WebSite'],q:'text',name:'Kept name'}}
 const result=await validate(document)
 assert.equal(result.status,prefix?'invalid':'valid')
 assert.deepEqual(result.report.issues.ERROR,prefix?[{message:'Unsupported context value semantics for prefix: p',severity:40,location_description:'At @context'}]:[])
})

test('an explicitly disabled prefix does not invent a second BIA model',async()=>{
 const document=JSON.parse(source);document['@context'].push({lab:{'@id':'http://bia','@prefix':false}})
 document['@graph'][1]['@type'].push('lab:/Publication')
 assert.equal((await validate(document)).status,'valid')
})
