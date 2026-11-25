import assert from 'node:assert/strict'
import {test} from 'node:test'
import {applyChange, createDraft, decodeDraft, encodeDraft, inspectDraft, materializeDraft} from '../../src/index.js'
import type {DraftChange} from '../../src/index.js'

test('organism selection assigns an identifier and scientific name atomically and survives backup', async () => {
  let draft = createDraft()
  const change = (command:DraftChange) => {const result = applyChange(draft,command); assert.equal(result.status,'applied'); if (result.status !== 'applied') throw Error('rejected'); draft = result.draft; return result.entityId}
  change({type:'add-study'})
  const sample = change({type:'add-entity',kind:'biosample'})
  change({type:'assign-organism',entityId:sample,previousId:null,identifier:'NCBITaxon:7227',label:'Drosophila melanogaster'})
  const view = inspectDraft(draft)
  const taxon = view.entities.find(entity => entity.kind === 'taxon')!
  assert.equal(taxon.id,'http://purl.obolibrary.org/obo/NCBITaxon_7227')
  assert.equal(taxon.scientificName,'Drosophila melanogaster')
  assert.deepEqual(view.entities.find(entity => entity.id === sample)?.references.organismClassification,[taxon.id])
  const output = materializeDraft(draft)
  assert.equal(output.status,'materialized')
  if (output.status !== 'materialized') throw Error()
  const metadata = JSON.parse(output.files.get('ro-crate-metadata.json') as string)
  assert.deepEqual(metadata['@graph'].find((node:{'@id':string}) => node['@id'] === taxon.id), {'@id':taxon.id,'@type':['bia:Taxon'],scientificName:'Drosophila melanogaster'})
  const restored = await decodeDraft(encodeDraft(draft))
  assert.equal(restored.status,'decoded')
  if (restored.status === 'decoded') assert.deepEqual(inspectDraft(restored.draft), view)
})

test('imaging selection updates both supported arrays atomically', () => {
  let draft = createDraft()
  const change = (command:DraftChange) => {const result = applyChange(draft,command); assert.equal(result.status,'applied'); if (result.status !== 'applied') throw Error('rejected'); draft = result.draft; return result.entityId}
  change({type:'add-study'})
  const protocol = change({type:'add-entity',kind:'acquisition-protocol'})
  change({type:'assign-imaging-method',entityId:protocol,identifier:'FBbi:00000243',label:'confocal microscopy'})
  const entity = inspectDraft(draft).entities.find(item => item.id === protocol)!
  assert.deepEqual(entity.fbbiId,['FBbi:00000243'])
  assert.deepEqual(entity.imagingMethodName,['confocal microscopy'])
})

test('editing imported terms preserves unrelated content and survives backup', async () => {
  let draft = createDraft()
  const add = (command:DraftChange) => {const result = applyChange(draft,command); if (result.status !== 'applied') throw Error('rejected'); draft = result.draft; return result.entityId}
  add({type:'add-study'})
  const protocol = add({type:'add-entity',kind:'acquisition-protocol'})
  add({type:'assign-imaging-method',entityId:protocol,identifier:'FBbi:00000243',label:'confocal microscopy'})
  const result = materializeDraft(draft)
  if (result.status !== 'materialized') throw Error()
  const metadata = JSON.parse(result.files.get('ro-crate-metadata.json') as string)
  metadata['@context'][1].custom = {'@id':'https://example.org/custom'}
  metadata['@graph'].find((node:{'@id':string}) => node['@id'] === protocol).custom = 'preserve me'
  const {importCrate} = await import('../../src/index.js')
  const imported = await importCrate(new Map([['ro-crate-metadata.json',JSON.stringify(metadata)]]),{metadataPaths:['ro-crate-metadata.json']})
  assert.equal(imported.status,'editable')
  if (imported.status !== 'editable') throw Error('not editable')
  const edited = applyChange(imported.draft,{type:'assign-imaging-method',entityId:protocol,identifier:'FBbi:00000001',label:'new method'})
  assert.equal(edited.status,'applied')
  if (edited.status !== 'applied') throw Error()
  const restored = await decodeDraft(encodeDraft(edited.draft))
  assert.equal(restored.status,'decoded')
  if (restored.status !== 'decoded') throw Error()
  const output = materializeDraft(restored.draft)
  if (output.status !== 'materialized') throw Error()
  const node = JSON.parse(new TextDecoder().decode(output.files.get('ro-crate-metadata.json') as Uint8Array))['@graph'].find((item:{'@id':string}) => item['@id'] === protocol)
  assert.equal(node.custom,'preserve me')
  assert.deepEqual(node.fbbiId,['FBbi:00000001'])
})

test('an explicit organism label correction preserves imported taxon properties', async () => {
  let draft = createDraft()
  const apply = (change:DraftChange) => {const result = applyChange(draft,change); if (result.status !== 'applied') throw Error('rejected'); draft = result.draft; return result.entityId}
  apply({type:'add-study'})
  const sample = apply({type:'add-entity',kind:'biosample'})
  apply({type:'assign-organism',entityId:sample,previousId:null,identifier:'NCBITaxon:9606',label:'Drosophila melanogaster'})
  const output = materializeDraft(draft); if (output.status !== 'materialized') throw Error()
  const metadata = JSON.parse(output.files.get('ro-crate-metadata.json') as string)
  metadata['@context'][1].custom = {'@id':'https://example.org/custom'}
  const id = 'http://purl.obolibrary.org/obo/NCBITaxon_9606'
  metadata['@graph'].find((node:{'@id':string}) => node['@id'] === id).custom = 'preserved'
  const {importCrate} = await import('../../src/index.js')
  const imported = await importCrate(new Map([['ro-crate-metadata.json',JSON.stringify(metadata)]]),{metadataPaths:['ro-crate-metadata.json']})
  if (imported.status !== 'editable') throw Error('import rejected')
  const edited = applyChange(imported.draft,{type:'assign-organism',entityId:sample,previousId:id,identifier:'NCBITaxon:9606',label:'Homo sapiens'})
  assert.equal(edited.status,'applied')
  if (edited.status !== 'applied') throw Error()
  const restored = await decodeDraft(encodeDraft(edited.draft))
  assert.equal(restored.status,'decoded')
  if (restored.status !== 'decoded') throw Error()
  const current = materializeDraft(restored.draft); if (current.status !== 'materialized') throw Error()
  const node = JSON.parse(new TextDecoder().decode(current.files.get('ro-crate-metadata.json') as Uint8Array))['@graph'].find((item:{'@id':string}) => item['@id'] === id)
  assert.equal(node.scientificName,'Homo sapiens')
  assert.equal(node.custom,'preserved')
})

test('independent imported imaging arrays are never silently truncated', async () => {
  let draft = createDraft()
  const apply = (command:DraftChange) => {const result = applyChange(draft,command); if (result.status !== 'applied') throw Error(); draft = result.draft; return result.entityId}
  apply({type:'add-study'})
  const protocol = apply({type:'add-entity',kind:'acquisition-protocol'})
  apply({type:'assign-imaging-method',entityId:protocol,identifier:'FBbi:00000243',label:'confocal microscopy'})
  const result = materializeDraft(draft); if (result.status !== 'materialized') throw Error()
  const metadata = JSON.parse(result.files.get('ro-crate-metadata.json') as string)
  const node = metadata['@graph'].find((item:{'@id':string}) => item['@id'] === protocol)
  node.fbbiId.push('FBbi:00000001'); node.imagingMethodName.push('second method')
  const {importCrate} = await import('../../src/index.js')
  const imported = await importCrate(new Map([['ro-crate-metadata.json',JSON.stringify(metadata)]]),{metadataPaths:['ro-crate-metadata.json']})
  if (imported.status !== 'editable') throw Error()
  const before = inspectDraft(imported.draft)
  assert.equal(applyChange(imported.draft,{type:'assign-imaging-method',entityId:protocol,identifier:'FBbi:00000002',label:'replacement'}).status,'rejected')
  assert.deepEqual(inspectDraft(imported.draft),before)
  const restored = await decodeDraft(encodeDraft(imported.draft))
  assert.equal(restored.status,'decoded')
})

test('conflicting or malformed assignments leave the draft untouched', () => {
  let draft = createDraft()
  const apply = (command:DraftChange) => {const result = applyChange(draft,command); if (result.status !== 'applied') throw Error(); draft = result.draft; return result.entityId}
  apply({type:'add-study'})
  const first = apply({type:'add-entity',kind:'biosample'})
  const second = apply({type:'add-entity',kind:'biosample'})
  apply({type:'assign-organism',entityId:first,previousId:null,identifier:'NCBITaxon:9606',label:'Homo sapiens'})
  const before = inspectDraft(draft)
  assert.equal(applyChange(draft,{type:'assign-organism',entityId:second,previousId:null,identifier:'NCBITaxon:9606',label:'Drosophila melanogaster'}).status,'rejected')
  assert.equal(applyChange(draft,{type:'assign-organism',entityId:first,previousId:null,identifier:{} as unknown as string,label:'name'}).status,'rejected')
  assert.deepEqual(inspectDraft(draft),before)
})

test('generic field commands cannot add unsupported fields to Taxon records', () => {
  let draft = createDraft()
  const apply = (command:DraftChange) => {const result = applyChange(draft,command); if (result.status !== 'applied') throw Error(); draft = result.draft; return result.entityId}
  apply({type:'add-study'})
  const sample = apply({type:'add-entity',kind:'biosample'})
  apply({type:'assign-organism',entityId:sample,previousId:null,identifier:'NCBITaxon:9606',label:'Homo sapiens'})
  const taxon = inspectDraft(draft).entities.find(item => item.kind === 'taxon')!
  assert.equal(applyChange(draft,{type:'set-field',entityId:taxon.id,field:'name',value:'unexpected'}).status,'rejected')
})
