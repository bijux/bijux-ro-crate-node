import assert from 'node:assert/strict'
import {test} from 'node:test'
import * as creator from '../../src/index.js'

const metadata = '{"@context":["https://w3id.org/ro/crate/1.1/context",{"bia":"http://bia/"}],"@graph":[{"@id":"ro-crate-metadata.json","@type":"CreativeWork","conformsTo":{"@id":"https://w3id.org/ro/crate/1.1"},"about":{"@id":"./"}},{"@id":"./","@type":["Dataset","bia:Study"],"name":"Original","unknown":{"@id":"#entity-1"}},{"@id":"#entity-1","@type":"bia:Unknown","value":"kept"}]}\n'

test('empty and incomplete drafts roundtrip and retain deleted IDs', async () => {
  assert.equal(typeof creator.encodeDraft, 'function')
  const empty = await creator.decodeDraft(creator.encodeDraft(creator.createDraft()))
  assert.equal(empty.status, 'decoded')
  if (empty.status !== 'decoded') return
  assert.equal(creator.materializeDraft(empty.draft).status, 'blocked')
  let draft = creator.createDraft()
  const step = (change: creator.DraftChange) => {const result = creator.applyChange(draft, change); if (result.status !== 'applied') throw Error('setup'); draft = result.draft; return result.entityId}
  step({type:'add-study'})
  step({type:'set-field', entityId:'./', field:'description', value:''})
  const removed = step({type:'add-entity', kind:'biosample'})
  step({type:'delete-entity', entityId:removed})
  const encoded = creator.encodeDraft(draft)
  const decoded = await creator.decodeDraft(encoded)
  assert.equal(decoded.status, 'decoded')
  if (decoded.status !== 'decoded') return
  assert.deepEqual(creator.inspectDraft(decoded.draft), creator.inspectDraft(draft))
  const next = creator.applyChange(decoded.draft, {type:'add-entity', kind:'biosample'})
  if (next.status !== 'applied') throw Error('add failed')
  assert.notEqual(next.entityId, removed)
})

test('imported edited content survives backup and retains unknown metadata and safety', async () => {
  const imported = await creator.importCrate(new Map([['ro-crate-metadata.json', metadata],['notes.txt','unchanged']]), {metadataPaths:['ro-crate-metadata.json','notes.txt']})
  if (imported.status !== 'editable') throw Error('setup')
  const changed = creator.applyChange(imported.draft, {type:'set-field', entityId:'./', field:'name', value:'Edited'})
  if (changed.status !== 'applied') throw Error('setup')
  const decoded = await creator.decodeDraft(creator.encodeDraft(changed.draft))
  assert.equal(decoded.status, 'decoded')
  if (decoded.status !== 'decoded') return
  const output = creator.materializeDraft(decoded.draft)
  if (output.status !== 'materialized') throw Error('export')
  const graph = JSON.parse(new TextDecoder().decode(output.files.get('ro-crate-metadata.json') as Uint8Array))['@graph']
  assert.deepEqual(graph[1], {'@id':'./','@type':['Dataset','bia:Study'],name:'Edited',unknown:{'@id':'#entity-1'}})
  assert.deepEqual(graph[2], {'@id':'#entity-1','@type':'bia:Unknown',value:'kept'})
  assert.deepEqual(output.files.get('notes.txt'), new TextEncoder().encode('unchanged'))
  const added = creator.applyChange(decoded.draft, {type:'add-entity',kind:'biosample'})
  if (added.status !== 'applied') throw Error('add')
  assert.notEqual(added.entityId, '#entity-1')
  assert.equal(creator.applyChange(added.draft, {type:'delete-entity',entityId:added.entityId}).status, 'rejected')
})

test('malformed, future and tampered backups are rejected without a draft', async () => {
  const valid = JSON.parse(creator.encodeDraft(creator.createDraft())) as Record<string, unknown>
  for (const value of [JSON.stringify({...valid, version:999}), JSON.stringify({...valid, extra:true}), '{"version":1,"version":1}', 'not json']) {
    const result = await creator.decodeDraft(value)
    assert.equal(result.status, 'rejected')
  }
})

test('imported no-op bytes and read-only recovery survive backup', async () => {
  const imported = await creator.importCrate(new Map([['ro-crate-metadata.json', metadata],['notes.txt','notes']]), {metadataPaths:['ro-crate-metadata.json','notes.txt']})
  if (imported.status !== 'editable') throw Error('setup')
  const reopened = await creator.decodeDraft(creator.encodeDraft(imported.draft))
  if (reopened.status !== 'decoded') throw Error('decode')
  const output = creator.materializeDraft(reopened.draft)
  if (output.status !== 'materialized') throw Error('export')
  assert.deepEqual(output.files.get('ro-crate-metadata.json'), new TextEncoder().encode(metadata))
  const readonly = await creator.importCrate(new Map([['ro-crate-metadata.json','{"unsupported":true}'], ['image.tif','payload']]), {metadataPaths:['ro-crate-metadata.json']})
  if (readonly.status !== 'read-only') throw Error('setup')
  const recovered = await creator.decodeDraft(creator.encodeReadOnlyImport(readonly))
  assert.equal(recovered.status, 'read-only')
  if (recovered.status === 'read-only') {
    assert.deepEqual(recovered.files.get('ro-crate-metadata.json'), new TextEncoder().encode('{"unsupported":true}'))
    assert.deepEqual(recovered.excludedPaths, ['image.tif'])
  }
})

test('forged imported state and source flags cannot bypass materialized content', async () => {
  const imported = await creator.importCrate(new Map([['ro-crate-metadata.json',metadata]]), {metadataPaths:['ro-crate-metadata.json']})
  if (imported.status !== 'editable') throw Error('setup')
  const changed = creator.applyChange(imported.draft, {type:'set-field',entityId:'./',field:'name',value:'Changed'})
  if (changed.status !== 'applied') throw Error('setup')
  const encoded = creator.encodeDraft(changed.draft)
  const forged = JSON.parse(encoded) as {snapshot:{study:{name:string}}; source:Record<string,unknown>}
  forged.snapshot.study.name = 'Forgery'
  assert.equal((await creator.decodeDraft(JSON.stringify(forged))).status, 'rejected')
  const flag = JSON.parse(encoded) as {source:Record<string,unknown>}
  flag.source.dirty = false
  assert.equal((await creator.decodeDraft(JSON.stringify(flag))).status, 'rejected')
  const damaged = JSON.parse(encoded) as {source:{current:Array<[string,string]>}}
  damaged.source.current[0][1] += ' '
  assert.equal((await creator.decodeDraft(JSON.stringify(damaged))).status, 'rejected')
})

test('invalid entity identity, counter and unknown fields are rejected', async () => {
  let draft = creator.createDraft()
  const study = creator.applyChange(draft, {type:'add-study'})
  if (study.status !== 'applied') throw Error('setup')
  const added = creator.applyChange(study.draft, {type:'add-entity',kind:'biosample'})
  if (added.status !== 'applied') throw Error('setup')
  draft = added.draft
  const encoded = creator.encodeDraft(draft)
  const counter = JSON.parse(encoded) as {nextId:number}
  counter.nextId = 1
  const id = JSON.parse(encoded) as {snapshot:{entities:Array<{id:string}>}}
  id.snapshot.entities[0].id = '../unsafe'
  const extra = JSON.parse(encoded) as {snapshot:{entities:Array<Record<string,unknown>>}}
  extra.snapshot.entities[0].unknown = 'not silently discarded'
  for (const tampered of [counter,id,extra]) assert.equal((await creator.decodeDraft(JSON.stringify(tampered))).status, 'rejected')
  assert.equal((await creator.decodeDraft('x'.repeat(65 * 1024 * 1024))).status, 'rejected')
})

test('file relationships and manifest updates survive reopening without shared mutable views', async () => {
  let draft = creator.createDraft()
  const step = (change: creator.DraftChange) => {const result = creator.applyChange(draft,change); if (result.status !== 'applied') throw Error('setup'); draft = result.draft; return result.entityId}
  step({type:'add-study'})
  const specimen = step({type:'add-entity',kind:'specimen'})
  const dataset = step({type:'add-entity',kind:'dataset'})
  step({type:'add-file',file:{path:'image.tif',size:'10',datasetId:dataset,specimenId:specimen,type:'image'}})
  const fresh = await creator.decodeDraft(creator.encodeDraft(draft))
  if (fresh.status !== 'decoded') throw Error('fresh decode')
  assert.deepEqual(creator.inspectDraft(fresh.draft), creator.inspectDraft(draft))
  const initial = creator.materializeDraft(fresh.draft)
  if (initial.status !== 'materialized') throw Error('export')
  const descriptor = JSON.parse(initial.files.get('ro-crate-metadata.json') as string) as {'@graph': Array<Record<string, unknown>>}
  const schema = descriptor['@graph'].find(node => node['@id'] === '#file-list-schema')!
  ;(schema.column as Array<Record<string,string>>).push({'@id':'#unknown-column'})
  descriptor['@graph'].push({'@id':'#unknown-column','@type':['csvw:Column'],columnName:'notes',propertyUrl:'http://example.org/note'})
  const table = (initial.files.get('file_list.tsv') as string).replace(/\n$/, '').split('\n').map((row, index) => row + (index ? '\tkept' : '\tnotes')).join('\n') + '\n'
  const imported = await creator.importCrate(new Map([['ro-crate-metadata.json',JSON.stringify(descriptor)],['file_list.tsv',table]]), {metadataPaths:['ro-crate-metadata.json','file_list.tsv']})
  if (imported.status !== 'editable') throw Error('import')
  const edited = creator.applyChange(imported.draft,{type:'update-file',file:{path:'image.tif',size:'11',datasetId:dataset,specimenId:specimen,type:'image'}})
  if (edited.status !== 'applied') throw Error('edit')
  const expected = creator.materializeDraft(edited.draft)
  const reopened = await creator.decodeDraft(creator.encodeDraft(edited.draft))
  if (expected.status !== 'materialized' || reopened.status !== 'decoded') throw Error('reopen')
  const actual = creator.materializeDraft(reopened.draft)
  if (actual.status !== 'materialized') throw Error('export')
  assert.deepEqual(actual.files.get('file_list.tsv'), expected.files.get('file_list.tsv'))
  assert.match(new TextDecoder().decode(actual.files.get('file_list.tsv') as Uint8Array), /image\.tif\t11\t.*\tkept\n/)
  ;(actual.files.get('file_list.tsv') as Uint8Array).fill(0)
  const again = creator.materializeDraft(reopened.draft)
  if (again.status !== 'materialized') throw Error('export')
  assert.deepEqual(again.files.get('file_list.tsv'), expected.files.get('file_list.tsv'))
})

test('removing the final imported relationship survives backup with the same view', async () => {
  let draft = creator.createDraft()
  const step = (change: creator.DraftChange) => {const result = creator.applyChange(draft,change); if (result.status !== 'applied') throw Error('setup'); draft = result.draft; return result.entityId}
  step({type:'add-study'})
  const specimen = step({type:'add-entity',kind:'specimen'})
  const preparation = step({type:'add-entity',kind:'preparation-protocol'})
  step({type:'add-reference',sourceId:specimen,relationship:'imagingPreparationProtocol',targetId:preparation})
  const output = creator.materializeDraft(draft)
  if (output.status !== 'materialized') throw Error('setup')
  const imported = await creator.importCrate(output.files,{metadataPaths:['ro-crate-metadata.json']})
  if (imported.status !== 'editable') throw Error('import')
  const removed = creator.applyChange(imported.draft,{type:'remove-reference',sourceId:specimen,relationship:'imagingPreparationProtocol',targetId:preparation})
  if (removed.status !== 'applied') throw Error('remove')
  const reopened = await creator.decodeDraft(creator.encodeDraft(removed.draft))
  assert.equal(reopened.status, 'decoded', reopened.status === 'rejected' ? reopened.issues.join(', ') : '')
  if (reopened.status === 'decoded') assert.deepEqual(creator.inspectDraft(reopened.draft), creator.inspectDraft(removed.draft))
})

test('inconsistent revision counters are rejected', async () => {
  const study = creator.applyChange(creator.createDraft(), {type:'add-study'})
  if (study.status !== 'applied') throw Error('setup')
  const fresh = JSON.parse(creator.encodeDraft(study.draft)) as {revision:number}
  fresh.revision = 0
  assert.equal((await creator.decodeDraft(JSON.stringify(fresh))).status, 'rejected')
  const imported = await creator.importCrate(new Map([['ro-crate-metadata.json', metadata]]), {metadataPaths:['ro-crate-metadata.json']})
  if (imported.status !== 'editable') throw Error('setup')
  const changed = creator.applyChange(imported.draft, {type:'set-field',entityId:'./',field:'name',value:'Changed'})
  if (changed.status !== 'applied') throw Error('setup')
  const modified = JSON.parse(creator.encodeDraft(changed.draft)) as {revision:number}
  modified.revision = 0
  assert.equal((await creator.decodeDraft(JSON.stringify(modified))).status, 'rejected')
})

test('unmodified imports reject impossible allocation counters', async () => {
  const imported = await creator.importCrate(new Map([['ro-crate-metadata.json',metadata]]), {metadataPaths:['ro-crate-metadata.json']})
  if (imported.status !== 'editable') throw Error('setup')
  const backup = creator.encodeDraft(imported.draft)
  const counter = JSON.parse(backup) as {nextId:number}
  counter.nextId = 100
  assert.equal((await creator.decodeDraft(JSON.stringify(counter))).status, 'rejected')
})

test('encoding refuses imported content that exceeds the re-admission limit', async () => {
  const imported = await creator.importCrate(new Map([['ro-crate-metadata.json',metadata]]), {metadataPaths:['ro-crate-metadata.json']})
  if (imported.status !== 'editable') throw Error('setup')
  const changed = creator.applyChange(imported.draft, {type:'set-field',entityId:'./',field:'name',value:'x'.repeat(16 * 1024 * 1024)})
  if (changed.status !== 'applied') throw Error('setup')
  assert.throws(() => creator.encodeDraft(changed.draft), /size limit/)
})

test('a large admitted metadata field can be backed up and reopened', async () => {
  const name = 'x'.repeat(10 * 1024 * 1024 - 4096)
  const text = metadata.replace('"name":"Original"', `"name":"${name}"`)
  const imported = await creator.importCrate(new Map([['ro-crate-metadata.json',text]]), {metadataPaths:['ro-crate-metadata.json']})
  if (imported.status !== 'editable') throw Error('large import rejected')
  const reopened = await creator.decodeDraft(creator.encodeDraft(imported.draft))
  assert.equal(reopened.status, 'decoded', reopened.status === 'rejected' ? reopened.issues.join(', ') : '')
  if (reopened.status === 'decoded') assert.equal(creator.inspectDraft(reopened.draft).study?.name, name)
})

test('accepted unfinished field strings survive a backup even with unpaired surrogates', async () => {
  let draft = creator.createDraft()
  const step = (change: creator.DraftChange) => {const result = creator.applyChange(draft, change); if (result.status !== 'applied') throw Error('setup'); draft = result.draft; return result.entityId}
  step({type:'add-study'})
  step({type:'set-field',entityId:'./',field:'name',value:'\ud800'})
  const entity = step({type:'add-entity',kind:'biosample'})
  step({type:'set-field',entityId:entity,field:'description',value:'\udfff'})
  const result = await creator.decodeDraft(creator.encodeDraft(draft))
  assert.equal(result.status, 'decoded', result.status === 'rejected' ? result.issues.join(', ') : '')
  if (result.status === 'decoded') assert.deepEqual(creator.inspectDraft(result.draft), creator.inspectDraft(draft))
})


test('ordinary edits beyond the public import limit remain recoverable', async () => {
  const name = 'x'.repeat(10 * 1024 * 1024 - 4096)
  const text = metadata.replace('"name":"Original"', `"name":"${name}"`)
  const imported = await creator.importCrate(new Map([['ro-crate-metadata.json',text]]), {metadataPaths:['ro-crate-metadata.json']})
  if (imported.status !== 'editable') throw Error('import')
  const changed = creator.applyChange(imported.draft, {type:'set-field',entityId:'./',field:'name',value:name + 'y'.repeat(8192)})
  if (changed.status !== 'applied') throw Error('edit')
  const output = creator.materializeDraft(changed.draft)
  if (output.status !== 'materialized') throw Error('export')
  assert.equal((await creator.importCrate(output.files,{metadataPaths:['ro-crate-metadata.json']})).status, 'rejected')
  const reopened = await creator.decodeDraft(creator.encodeDraft(changed.draft))
  assert.equal(reopened.status, 'decoded', reopened.status === 'rejected' ? reopened.issues.join(', ') : '')
  if (reopened.status === 'decoded') assert.equal(creator.inspectDraft(reopened.draft).study?.name, name + 'y'.repeat(8192))
})

test('forged current content cannot remove opaque properties or nodes', async () => {
  const imported = await creator.importCrate(new Map([['ro-crate-metadata.json',metadata]]), {metadataPaths:['ro-crate-metadata.json']})
  if (imported.status !== 'editable') throw Error('setup')
  const changed = creator.applyChange(imported.draft,{type:'set-field',entityId:'./',field:'name',value:'Edited'})
  if (changed.status !== 'applied') throw Error('setup')
  for (const remove of ['property','node'] as const) {
    const backup = JSON.parse(creator.encodeDraft(changed.draft)) as {source:{current:Array<[string,string]>}}
    const entry = backup.source.current.find(([path]) => path === 'ro-crate-metadata.json')!
    const graph = JSON.parse(atob(entry[1])) as {'@graph':Array<Record<string,unknown>>}
    if (remove === 'property') delete graph['@graph'][1].unknown
    else graph['@graph'].splice(2,1)
    entry[1] = btoa(JSON.stringify(graph,null,2) + '\n')
    assert.equal((await creator.decodeDraft(JSON.stringify(backup))).status, 'rejected', remove)
  }
})

test('forged current content cannot remove opaque file-list columns', async () => {
  let draft = creator.createDraft()
  const step = (change: creator.DraftChange) => {const result = creator.applyChange(draft,change); if (result.status !== 'applied') throw Error('setup'); draft = result.draft; return result.entityId}
  step({type:'add-study'})
  const specimen = step({type:'add-entity',kind:'specimen'})
  const dataset = step({type:'add-entity',kind:'dataset'})
  step({type:'add-file',file:{path:'image.tif',size:'10',datasetId:dataset,specimenId:specimen,type:'image'}})
  const generated = creator.materializeDraft(draft)
  if (generated.status !== 'materialized') throw Error('setup')
  const descriptor = JSON.parse(generated.files.get('ro-crate-metadata.json') as string) as {'@graph':Array<Record<string,unknown>>}
  const schema = descriptor['@graph'].find(node => node['@id'] === '#file-list-schema')!
  ;(schema.column as Array<Record<string,string>>).push({'@id':'#unknown-column'})
  descriptor['@graph'].push({'@id':'#unknown-column','@type':['csvw:Column'],columnName:'notes',propertyUrl:'http://example.org/note'})
  const table = (generated.files.get('file_list.tsv') as string).replace(/\n$/, '').split('\n').map((line,index) => line + (index ? '\tkept' : '\tnotes')).join('\n') + '\n'
  const imported = await creator.importCrate(new Map([['ro-crate-metadata.json',JSON.stringify(descriptor)],['file_list.tsv',table]]), {metadataPaths:['ro-crate-metadata.json','file_list.tsv']})
  if (imported.status !== 'editable') throw Error('setup')
  const changed = creator.applyChange(imported.draft,{type:'set-field',entityId:'./',field:'name',value:'Edited'})
  if (changed.status !== 'applied') throw Error('setup')
  const encoded = creator.encodeDraft(changed.draft)
  const altered = JSON.parse(encoded) as {source:{current:Array<[string,string]>}}
  const alteredTable = altered.source.current.find(([path]) => path === 'file_list.tsv')!
  alteredTable[1] = btoa(atob(alteredTable[1]).replace('\tkept\n', '\taltered\n'))
  assert.equal((await creator.decodeDraft(JSON.stringify(altered))).status, 'rejected')
  const backup = JSON.parse(encoded) as {source:{current:Array<[string,string]>}}
  const descriptorEntry = backup.source.current.find(([path]) => path === 'ro-crate-metadata.json')!
  const graph = JSON.parse(atob(descriptorEntry[1])) as {'@graph':Array<Record<string,unknown>>}
  const schemaCurrent = graph['@graph'].find(node => node['@id'] === '#file-list-schema')!
  ;(schemaCurrent.column as Array<Record<string,string>>).pop()
  graph['@graph'] = graph['@graph'].filter(node => node['@id'] !== '#unknown-column')
  descriptorEntry[1] = btoa(JSON.stringify(graph,null,2) + '\n')
  const tableEntry = backup.source.current.find(([path]) => path === 'file_list.tsv')!
  tableEntry[1] = btoa(atob(tableEntry[1]).replace(/\tnotes\n/, '\n').replace(/\tkept\n/, '\n'))
  assert.equal((await creator.decodeDraft(JSON.stringify(backup))).status, 'rejected')
})

test('supported additions and relationships remain recoverable alongside opaque metadata', async () => {
  const imported = await creator.importCrate(new Map([['ro-crate-metadata.json',metadata]]), {metadataPaths:['ro-crate-metadata.json']})
  if (imported.status !== 'editable') throw Error('setup')
  let draft = imported.draft
  const step = (change: creator.DraftChange) => {const result = creator.applyChange(draft, change); if (result.status !== 'applied') throw Error('edit'); draft = result.draft; return result.entityId}
  const sample = step({type:'add-entity',kind:'biosample'})
  const specimen = step({type:'add-entity',kind:'specimen'})
  const prep = step({type:'add-entity',kind:'preparation-protocol'})
  const acquisition = step({type:'add-entity',kind:'acquisition-protocol'})
  const dataset = step({type:'add-entity',kind:'dataset'})
  step({type:'set-field',entityId:acquisition,field:'imagingInstrumentDescription',value:'instrument'})
  step({type:'add-reference',sourceId:specimen,relationship:'biologicalEntity',targetId:sample})
  step({type:'add-reference',sourceId:specimen,relationship:'imagingPreparationProtocol',targetId:prep})
  step({type:'add-reference',sourceId:dataset,relationship:'associatedSpecimen',targetId:specimen})
  step({type:'add-reference',sourceId:dataset,relationship:'associatedImageAcquisitionProtocol',targetId:acquisition})
  const result = await creator.decodeDraft(creator.encodeDraft(draft))
  assert.equal(result.status, 'decoded', result.status === 'rejected' ? result.issues.join(', ') : '')
  if (result.status === 'decoded') assert.deepEqual(creator.inspectDraft(result.draft),creator.inspectDraft(draft))
})


test('forged current content cannot change opaque context or add unknown entity fields', async () => {
  const source = metadata.replace('"bia":"http://bia/"', '"bia":"http://bia/","other":"http://example.org/other"')
  const imported = await creator.importCrate(new Map([['ro-crate-metadata.json',source]]), {metadataPaths:['ro-crate-metadata.json']})
  if (imported.status !== 'editable') throw Error('setup')
  const added = creator.applyChange(imported.draft, {type:'add-entity',kind:'biosample'})
  if (added.status !== 'applied') throw Error('setup')
  const encoded = creator.encodeDraft(added.draft)
  for (const edit of ['context','new-field'] as const) {
    const backup = JSON.parse(encoded) as {source:{current:Array<[string,string]>}}
    const entry = backup.source.current[0]
    const current = JSON.parse(atob(entry[1])) as {'@context':[string,Record<string,unknown>]; '@graph':Array<Record<string,unknown>>}
    if (edit === 'context') delete current['@context'][1].other
    else current['@graph'].at(-1)!.unexpected = 'discarded'
    entry[1] = btoa(JSON.stringify(current,null,2) + '\n')
    assert.equal((await creator.decodeDraft(JSON.stringify(backup))).status, 'rejected', edit)
  }
})

test('accepted imported field strings with unpaired surrogates survive backup', async () => {
  const imported = await creator.importCrate(new Map([['ro-crate-metadata.json',metadata]]), {metadataPaths:['ro-crate-metadata.json']})
  if (imported.status !== 'editable') throw Error('setup')
  const changed = creator.applyChange(imported.draft, {type:'set-field',entityId:'./',field:'name',value:'\ud800'})
  if (changed.status !== 'applied') throw Error('edit')
  const result = await creator.decodeDraft(creator.encodeDraft(changed.draft))
  assert.equal(result.status, 'decoded', result.status === 'rejected' ? result.issues.join(', ') : '')
  if (result.status === 'decoded') assert.equal(creator.inspectDraft(result.draft).study?.name, '\ud800')
})
