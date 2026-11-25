import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createDraft, applyChange, inspectDraft} from '@bijux/ro-crate-creator'
import {encodeRecovery, decodeRecovery} from '../src/drafts/recovery-codec.js'

test('recovery retains unfinished duplicate listings and detached draft state', async () => {
  const changed = applyChange(createDraft(), {type:'add-study'})
  if (changed.status !== 'applied') throw Error('setup')
  const named = applyChange(changed.draft, {type:'set-field', entityId:'./', field:'name', value:'Recovery study'})
  if (named.status !== 'applied') throw Error('setup')
  const rows = [{id:'p:1', path:'images/a.tif', size:'4'}, {id:'p:2', path:'images/a.tif', size:'900719925474099312345'}]
  const encoded = encodeRecovery({draft:named.draft, pending:rows})
  rows[0].path = 'changed'
  const decoded = await decodeRecovery(encoded)
  assert.equal(decoded.status, 'decoded')
  if (decoded.status !== 'decoded') return
  assert.equal(inspectDraft(decoded.draft).study?.name, 'Recovery study')
  assert.deepEqual(decoded.pending.map(row => row.path), ['images/a.tif','images/a.tif'])
  assert.equal(decoded.pending[1].size, '900719925474099312345')
  assert.equal(decoded.materialization.status, 'blocked')
  if (decoded.materialization.status === 'blocked') assert.ok(decoded.materialization.issues.some(issue => issue.code === 'pending-file-listings'))
})

test('recovery rejects unrecognized fields and invalid pending metadata', async () => {
  const encoded = encodeRecovery({draft:createDraft(), pending:[]})
  const value = JSON.parse(encoded)
  value.pending = [{id:'p:1', path:'../bad', size:'2'}]
  assert.equal((await decodeRecovery(JSON.stringify(value))).status, 'rejected')
  value.pending = [{id:'p:1', path:'x', size:'2', payload:'bytes'}]
  assert.equal((await decodeRecovery(JSON.stringify(value))).status, 'rejected')
  assert.throws(() => encodeRecovery({draft:createDraft(), pending:[{id:'p:1',path:'x',size:'2'}, {id:'p:1',path:'y',size:'2'}]}))
  assert.equal((await decodeRecovery(encoded.replace('"version":1','"version":2'))).status, 'rejected')
})


test('a recovery draft with no pending listings can materialize', async () => {
  const changed = applyChange(createDraft(),{type:'add-study'})
  if (changed.status !== 'applied') throw Error('study')
  const decoded = await decodeRecovery(encodeRecovery({draft:changed.draft,pending:[]}))
  assert.equal(decoded.status,'decoded')
  if (decoded.status === 'decoded') assert.equal(decoded.materialization.status,'materialized')
})

test('unfinished term input survives recovery and blocks materialization', async () => {
  const created = applyChange(createDraft(),{type:'add-study'}); if (created.status !== 'applied') throw Error()
  const sample = applyChange(created.draft,{type:'add-entity',kind:'biosample'}); if (sample.status !== 'applied') throw Error()
  const term = {kind:'taxonomy' as const,entityId:sample.entityId,previousId:null,identifier:'NCBITaxon:',label:'partial'}
  const text = encodeRecovery({draft:sample.draft,pending:[],pendingTerms:[term]})
  assert.equal(JSON.parse(text).version,2)
  const decoded = await decodeRecovery(text)
  assert.equal(decoded.status,'decoded')
  if (decoded.status !== 'decoded') throw Error()
  assert.deepEqual(decoded.pendingTerms,[term])
  assert.equal(decoded.materialization.status,'blocked')
  const legacy = await decodeRecovery(encodeRecovery({draft:sample.draft,pending:[]}))
  if (legacy.status !== 'decoded') throw Error()
  assert.deepEqual(legacy.pendingTerms,[])
})

test('recovery rejects duplicate or malformed unfinished terms', () => {
  const draft = createDraft()
  const entry = {kind:'taxonomy' as const,entityId:'#entity-1',previousId:null,identifier:'id',label:'label'}
  assert.throws(() => encodeRecovery({draft,pending:[],pendingTerms:[entry,entry]}))
  assert.throws(() => encodeRecovery({draft,pending:[],pendingTerms:[{...entry,kind:'invalid' as 'taxonomy'}]}))
})

test('recovery reports both pending files and vocabulary and rejects malformed version two', async () => {
  const created = applyChange(createDraft(),{type:'add-study'}); if (created.status !== 'applied') throw Error()
  const sample = applyChange(created.draft,{type:'add-entity',kind:'biosample'}); if (sample.status !== 'applied') throw Error()
  const term = {kind:'taxonomy' as const,entityId:sample.entityId,previousId:null,identifier:'NCBITaxon:',label:'partial'}
  const text = encodeRecovery({draft:sample.draft,pending:[{id:'p:1',path:'file.tif',size:'1'}],pendingTerms:[term]})
  const decoded = await decodeRecovery(text)
  if (decoded.status !== 'decoded' || decoded.materialization.status !== 'blocked') throw Error('pending work was not blocked')
  assert.deepEqual(decoded.materialization.issues.map(issue => issue.code),['pending-file-listings','pending-vocabulary'])
  const value = JSON.parse(text)
  value.pendingTerms[0].extra = 'unexpected'
  assert.equal((await decodeRecovery(JSON.stringify(value))).status,'rejected')
})

test('pending vocabulary must identify an editable slot of the decoded draft', async () => {
  let result = applyChange(createDraft(),{type:'add-study'}); if (result.status !== 'applied') throw Error()
  result = applyChange(result.draft,{type:'add-entity',kind:'biosample'}); if (result.status !== 'applied') throw Error()
  const sample = result.entityId
  result = applyChange(result.draft,{type:'add-entity',kind:'acquisition-protocol'}); if (result.status !== 'applied') throw Error()
  const protocol = result.entityId
  result = applyChange(result.draft,{type:'add-entity',kind:'biosample'}); if (result.status !== 'applied') throw Error()
  const unlinked = result.entityId
  result = applyChange(result.draft,{type:'assign-organism',entityId:sample,previousId:null,identifier:'NCBITaxon:9606',label:'Homo sapiens'}); if (result.status !== 'applied') throw Error()
  const draft = result.draft
  const id = 'http://purl.obolibrary.org/obo/NCBITaxon_9606'
  const slots = [
    {kind:'taxonomy' as const,entityId:'#missing',previousId:null,identifier:'x',label:'x'},
    {kind:'taxonomy' as const,entityId:protocol,previousId:null,identifier:'x',label:'x'},
    {kind:'imaging' as const,entityId:sample,previousId:null,identifier:'x',label:'x'},
    {kind:'taxonomy' as const,entityId:unlinked,previousId:id,identifier:'x',label:'x'},
    {kind:'taxonomy' as const,entityId:sample,previousId:'#unreferenced',identifier:'x',label:'x'},
    {kind:'taxonomy' as const,entityId:sample,previousId:protocol,identifier:'x',label:'x'},
  ]
  const valid = {kind:'taxonomy' as const,entityId:sample,previousId:id,identifier:'NCBITaxon:9606',label:'draft'}
  const envelope = JSON.parse(encodeRecovery({draft,pending:[],pendingTerms:[valid]}))
  for (const slot of slots) {
    assert.throws(() => encodeRecovery({draft,pending:[],pendingTerms:[slot]}))
    envelope.pendingTerms = [slot]
    assert.equal((await decodeRecovery(JSON.stringify(envelope))).status,'rejected')
  }
})

test('long admitted Taxon identity and scientific name remain recoverable while editing', async () => {
  const {importCrate,materializeDraft} = await import('@bijux/ro-crate-creator')
  let result = applyChange(createDraft(),{type:'add-study'}); if (result.status !== 'applied') throw Error()
  result = applyChange(result.draft,{type:'add-entity',kind:'biosample'}); if (result.status !== 'applied') throw Error()
  const sample = result.entityId
  result = applyChange(result.draft,{type:'assign-organism',entityId:sample,previousId:null,identifier:'NCBITaxon:9606',label:'Homo sapiens'}); if (result.status !== 'applied') throw Error()
  const materialized = materializeDraft(result.draft); if (materialized.status !== 'materialized') throw Error()
  const metadata = JSON.parse(materialized.files.get('ro-crate-metadata.json') as string)
  const oldId = 'http://purl.obolibrary.org/obo/NCBITaxon_9606', id = '#' + 't'.repeat(5000), label = 'n'.repeat(6000)
  const taxon = metadata['@graph'].find((node:{'@id':string}) => node['@id'] === oldId)
  taxon['@id'] = id; taxon.scientificName = label
  metadata['@graph'].find((node:{'@id':string}) => node['@id'] === sample).organismClassification[0]['@id'] = id
  const imported = await importCrate(new Map([['ro-crate-metadata.json',JSON.stringify(metadata)]]),{metadataPaths:['ro-crate-metadata.json']})
  assert.equal(imported.status,'editable'); if (imported.status !== 'editable') throw Error()
  const term = {kind:'taxonomy' as const,entityId:sample,previousId:id,identifier:id,label:label + 'x'}
  const decoded = await decodeRecovery(encodeRecovery({draft:imported.draft,pending:[],pendingTerms:[term]}))
  assert.equal(decoded.status,'decoded')
  if (decoded.status === 'decoded') {assert.deepEqual(decoded.pendingTerms,[term]); assert.equal(decoded.materialization.status,'blocked')}
})

test('pending imaging cannot target imported multiple independent values', async () => {
  const {importCrate,materializeDraft} = await import('@bijux/ro-crate-creator')
  let result = applyChange(createDraft(),{type:'add-study'}); if (result.status !== 'applied') throw Error()
  result = applyChange(result.draft,{type:'add-entity',kind:'acquisition-protocol'}); if (result.status !== 'applied') throw Error()
  const protocol = result.entityId
  result = applyChange(result.draft,{type:'assign-imaging-method',entityId:protocol,identifier:'FBbi:00000246',label:'method'}); if (result.status !== 'applied') throw Error()
  const output = materializeDraft(result.draft); if (output.status !== 'materialized') throw Error()
  const metadata = JSON.parse(output.files.get('ro-crate-metadata.json') as string)
  metadata['@graph'].find((node:{'@id':string}) => node['@id'] === protocol).fbbiId.push('FBbi:00000001')
  const imported = await importCrate(new Map([['ro-crate-metadata.json',JSON.stringify(metadata)]]),{metadataPaths:['ro-crate-metadata.json']}); if (imported.status !== 'editable') throw Error()
  const term = {kind:'imaging' as const,entityId:protocol,previousId:null,identifier:'x',label:'x'}
  assert.throws(() => encodeRecovery({draft:imported.draft,pending:[],pendingTerms:[term]}))
  const envelope = JSON.parse(encodeRecovery({draft:imported.draft,pending:[]})); envelope.version = 2; envelope.pendingTerms = [term]
  assert.equal((await decodeRecovery(JSON.stringify(envelope))).status,'rejected')
})

test('pending text retains accepted Unicode while the total recovery ceiling remains enforced', async () => {
  const {RECOVERY_MAX_BYTES} = await import('../src/drafts/recovery-codec.js')
  let result = applyChange(createDraft(),{type:'add-study'}); if (result.status !== 'applied') throw Error()
  result = applyChange(result.draft,{type:'add-entity',kind:'biosample'}); if (result.status !== 'applied') throw Error()
  const term = {kind:'taxonomy' as const,entityId:result.entityId,previousId:null,identifier:'',label:'\ud800'}
  const decoded = await decodeRecovery(encodeRecovery({draft:result.draft,pending:[],pendingTerms:[term]}))
  assert.equal(decoded.status,'decoded')
  if (decoded.status === 'decoded') assert.equal(decoded.pendingTerms[0].label,'\ud800')
  assert.throws(() => encodeRecovery({draft:result.draft,pending:[],pendingTerms:[{...term,label:'x'.repeat(RECOVERY_MAX_BYTES)}]}),/exceeds the size limit/)
})
