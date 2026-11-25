import assert from 'node:assert/strict'
import {test} from 'node:test'
import {applyChange, createDraft, inspectDraft, inspectIncomingReferences, materializeDraft, importCrate, encodeDraft, decodeDraft, createHistory, applyHistoryChanges, inspectHistory, undo, redo, type DraftChange} from '../../src/index.js'

test('study authors, shared affiliations, publications and funding retain identities and explicit order', async () => {
  let draft = createDraft()
  const step = (change: DraftChange) => {const result = applyChange(draft,change); if (result.status !== 'applied') throw Error(`rejected: ${result.issues[0].message}`); draft = result.draft; return result.entityId}
  step({type:'add-study'})
  const first = step({type:'add-entity',kind:'contributor'})
  const second = step({type:'add-entity',kind:'contributor'})
  const affiliation = step({type:'add-entity',kind:'affiliation'})
  const publication = step({type:'add-entity',kind:'publication'})
  const grant = step({type:'add-entity',kind:'grant'})
  const funder = step({type:'add-entity',kind:'funding-body'})
  step({type:'set-field',entityId:first,field:'name',value:'First'})
  step({type:'set-field',entityId:second,field:'name',value:'Second'})
  step({type:'set-roles',entityId:first,roles:['Investigation','']})
  step({type:'set-field',entityId:affiliation,field:'name',value:'Shared institute'})
  step({type:'set-field',entityId:publication,field:'doi',value:'10.1234/example'})
  step({type:'set-field',entityId:grant,field:'identifier',value:'award-7'})
  step({type:'set-field',entityId:funder,field:'name',value:'Research fund'})
  step({type:'add-reference',sourceId:'./',relationship:'author',targetId:first})
  step({type:'add-reference',sourceId:'./',relationship:'author',targetId:second})
  step({type:'add-reference',sourceId:'./',relationship:'relatedPublication',targetId:publication})
  step({type:'add-reference',sourceId:'./',relationship:'funding',targetId:grant})
  step({type:'add-reference',sourceId:first,relationship:'memberOf',targetId:affiliation})
  step({type:'add-reference',sourceId:second,relationship:'memberOf',targetId:affiliation})
  step({type:'add-reference',sourceId:grant,relationship:'funder',targetId:funder})
  const before = draft
  step({type:'move-author',entityId:second,index:0})
  assert.deepEqual(inspectDraft(draft).study?.references?.author,[second,first])
  assert.deepEqual(inspectIncomingReferences(draft,affiliation),[{sourceId:first,relationship:'memberOf'},{sourceId:second,relationship:'memberOf'}])
  assert.equal(applyChange(draft,{type:'delete-entity',entityId:affiliation}).status,'rejected')
  assert.equal(applyChange(draft,{type:'add-reference',sourceId:'./',relationship:'author',targetId:grant}).status,'rejected')
  assert.equal(applyChange(draft,{type:'move-author',entityId:second,index:8}).status,'rejected')
  assert.deepEqual(inspectDraft(before).study?.references?.author,[first,second])
  const output = materializeDraft(draft)
  if (output.status !== 'materialized') throw Error('export')
  const document = JSON.parse(output.files.get('ro-crate-metadata.json') as string) as {'@graph':Array<Record<string,unknown>>; '@context':[string,Record<string,unknown>]}
  const graph = new Map(document['@graph'].map(node => [node['@id'],node]))
  assert.deepEqual(graph.get('./')?.author,[{'@id':second},{'@id':first}])
  assert.deepEqual(graph.get('./')?.relatedPublication,[{'@id':publication}])
  assert.deepEqual(graph.get('./')?.funding,[{'@id':grant}])
  assert.deepEqual(graph.get(first)?.memberOf,[{'@id':affiliation}])
  assert.deepEqual(graph.get(first)?.role,['Investigation',''])
  assert.deepEqual(graph.get(second)?.memberOf,[{'@id':affiliation}])
  assert.deepEqual(graph.get(grant)?.funder,[{'@id':funder}])
  assert.deepEqual(document['@context'][1].author,{'@id':'schema:author','@container':'@set'})
  assert.deepEqual(document['@context'][1].relatedPublication,{'@id':'bia:relatedPublication','@container':'@set'})
  assert.deepEqual(document['@context'][1].funding,{'@id':'schema:funding','@container':'@set'})
  const imported = await importCrate(output.files,{metadataPaths:['ro-crate-metadata.json']})
  assert.equal(imported.status,'editable',imported.status === 'editable' ? '' : imported.issues.join(', '))
  if (imported.status !== 'editable') return
  assert.deepEqual(inspectDraft(imported.draft).study?.references?.author,[second,first])
  assert.deepEqual(inspectDraft(imported.draft).entities.find(entity => entity.id === first)?.role,['Investigation',''])
  const reopened = await decodeDraft(encodeDraft(imported.draft))
  assert.equal(reopened.status,'decoded',reopened.status === 'rejected' ? reopened.issues.join(', ') : '')
  if (reopened.status === 'decoded') assert.deepEqual(inspectDraft(reopened.draft).study?.references?.author,[second,first])
  const history = createHistory(imported.draft)
  const moved = applyHistoryChanges(history,[{type:'move-author',entityId:first,index:0}])
  if (moved.status !== 'applied') throw Error('history edit')
  const undone = undo(moved.history)
  if (undone.status !== 'applied') throw Error('undo')
  assert.deepEqual(inspectDraft(inspectHistory(undone.history).draft).study?.references?.author,[second,first])
  const redone = redo(undone.history)
  if (redone.status !== 'applied') throw Error('redo')
  assert.deepEqual(inspectDraft(inspectHistory(redone.history).draft).study?.references?.author,[first,second])
})

test('imported edits preserve unknown content and author sequence through backups', async () => {
  let draft = createDraft()
  const step = (change: DraftChange) => {const result = applyChange(draft,change); if (result.status !== 'applied') throw Error('setup'); draft = result.draft; return result.entityId}
  step({type:'add-study'})
  const first = step({type:'add-entity',kind:'contributor'})
  const second = step({type:'add-entity',kind:'contributor'})
  step({type:'set-field',entityId:first,field:'name',value:'First'})
  step({type:'set-field',entityId:second,field:'name',value:'Second'})
  step({type:'add-reference',sourceId:'./',relationship:'author',targetId:first})
  step({type:'add-reference',sourceId:'./',relationship:'author',targetId:second})
  const fresh = await decodeDraft(encodeDraft(draft))
  assert.equal(fresh.status,'decoded',fresh.status === 'rejected' ? fresh.issues.join(', ') : '')
  const initial = materializeDraft(draft)
  if (initial.status !== 'materialized') throw Error('setup')
  const data = JSON.parse(initial.files.get('ro-crate-metadata.json') as string) as {'@graph':Array<Record<string,unknown>>}
  data['@graph'][1].opaque = {nested:['kept']}
  const original = JSON.stringify(data)
  const imported = await importCrate(new Map([['ro-crate-metadata.json',original]]),{metadataPaths:['ro-crate-metadata.json']})
  if (imported.status !== 'editable') throw Error('import')
  const moved = applyChange(imported.draft,{type:'move-author',entityId:second,index:0})
  if (moved.status !== 'applied') throw Error('move')
  const withRoles = applyChange(moved.draft,{type:'set-roles',entityId:first,roles:['Writing']})
  if (withRoles.status !== 'applied') throw Error('roles')
  const backed = await decodeDraft(encodeDraft(withRoles.draft))
  assert.equal(backed.status,'decoded',backed.status === 'rejected' ? backed.issues.join(', ') : '')
  if (backed.status !== 'decoded') return
  const exported = materializeDraft(backed.draft)
  if (exported.status !== 'materialized') throw Error('export')
  const graph = JSON.parse(new TextDecoder().decode(exported.files.get('ro-crate-metadata.json') as Uint8Array))['@graph'] as Array<Record<string,unknown>>
  assert.deepEqual(graph[1].opaque,{nested:['kept']})
  assert.deepEqual(graph[1].author,[{'@id':second},{'@id':first}])
  assert.deepEqual(graph.find(node => node['@id'] === first)?.role,['Writing'])
  const view = inspectDraft(backed.draft)
  const authors = view.study?.references?.author as string[]
  authors.push('#external')
  assert.deepEqual(inspectDraft(backed.draft).study?.references?.author,[second,first])
  assert.equal(applyChange(backed.draft,{type:'delete-entity',entityId:first}).status,'rejected')
})

test('roles and study funding statement validate operation targets atomically', () => {
  let draft = createDraft()
  const study = applyChange(draft,{type:'add-study'})
  if (study.status !== 'applied') throw Error('study')
  draft = study.draft
  const statement = applyChange(draft,{type:'set-field',entityId:'./',field:'fundingStatement',value:''})
  if (statement.status !== 'applied') throw Error('statement')
  draft = statement.draft
  const output = materializeDraft(draft)
  if (output.status !== 'materialized') throw Error('export')
  const metadata = JSON.parse(output.files.get('ro-crate-metadata.json') as string) as {'@context':[string,Record<string,unknown>]; '@graph':Array<Record<string,unknown>>}
  assert.deepEqual(metadata['@context'][1].fundingStatement,{'@id':'bia:fundingStatement'})
  assert.equal(metadata['@graph'][1].fundingStatement,'')
  assert.equal(applyChange(draft,{type:'set-roles',entityId:'./',roles:['Author']}).status,'rejected')
  assert.equal(applyChange(draft,{type:'move-author',entityId:'#missing',index:0}).status,'rejected')
})

test('author and affiliation references block deletion and role arrays are detached', () => {
  let draft = createDraft()
  const step = (change: DraftChange) => {const result = applyChange(draft,change); if (result.status !== 'applied') throw Error('setup'); draft = result.draft; return result.entityId}
  step({type:'add-study'})
  const author = step({type:'add-entity',kind:'contributor'})
  const institution = step({type:'add-entity',kind:'affiliation'})
  const roles = ['Investigation']
  step({type:'set-roles',entityId:author,roles})
  roles.push('outside')
  step({type:'add-reference',sourceId:'./',relationship:'author',targetId:author})
  step({type:'add-reference',sourceId:author,relationship:'memberOf',targetId:institution})
  const blocked = applyChange(draft,{type:'delete-entity',entityId:author})
  assert.equal(blocked.status,'rejected')
  if (blocked.status === 'rejected') assert.deepEqual(blocked.references,[{sourceId:'./',relationship:'author'}])
  const view = inspectDraft(draft)
  const returnedRoles = view.entities.find(entity => entity.id === author)?.role as string[]
  returnedRoles.push('view-only')
  assert.deepEqual(inspectDraft(draft).entities.find(entity => entity.id === author)?.role,['Investigation'])
  assert.equal(applyChange(draft,{type:'set-roles',entityId:institution,roles:['wrong target']}).status,'rejected')
  step({type:'remove-reference',sourceId:'./',relationship:'author',targetId:author})
  step({type:'delete-entity',entityId:author})
  step({type:'delete-entity',entityId:institution})
})

test('imported publication year remains opaque through DOI edits and backup', async () => {
  let draft = createDraft()
  const step = (change: DraftChange) => {const result = applyChange(draft,change); if (result.status !== 'applied') throw Error('setup'); draft = result.draft; return result.entityId}
  step({type:'add-study'})
  const publication = step({type:'add-entity',kind:'publication'})
  step({type:'add-reference',sourceId:'./',relationship:'relatedPublication',targetId:publication})
  const output = materializeDraft(draft)
  if (output.status !== 'materialized') throw Error('export')
  const data = JSON.parse(output.files.get('ro-crate-metadata.json') as string) as {'@graph':Array<Record<string,unknown>>; '@context':[string,Record<string,unknown>]}
  data['@context'][1].yearPublished = {'@id':'bia:yearPublished'}
  data['@graph'].find(node => node['@id'] === publication)!.yearPublished = 2020
  const source = JSON.stringify(data)
  const imported = await importCrate(new Map([['ro-crate-metadata.json',source]]),{metadataPaths:['ro-crate-metadata.json']})
  if (imported.status !== 'editable') throw Error('import')
  const unchanged = materializeDraft(imported.draft)
  if (unchanged.status !== 'materialized') throw Error('no-op export')
  assert.deepEqual(unchanged.files.get('ro-crate-metadata.json'),new TextEncoder().encode(source))
  const edited = applyChange(imported.draft,{type:'set-field',entityId:publication,field:'doi',value:'10.1234/example'})
  if (edited.status !== 'applied') throw Error('edit')
  const restored = await decodeDraft(encodeDraft(edited.draft))
  assert.equal(restored.status,'decoded',restored.status === 'rejected' ? restored.issues.join(', ') : '')
  if (restored.status !== 'decoded') return
  const exported = materializeDraft(restored.draft)
  if (exported.status !== 'materialized') throw Error('export')
  const graph = JSON.parse(new TextDecoder().decode(exported.files.get('ro-crate-metadata.json') as Uint8Array))['@graph'] as Array<Record<string,unknown>>
  assert.equal(graph.find(node => node['@id'] === publication)?.yearPublished,2020)
  assert.equal(graph.find(node => node['@id'] === publication)?.doi,'10.1234/example')
})

test('an imported context cannot redefine emitted schema type aliases', async () => {
  for (const alias of ['Person','Dataset','CreativeWork','File']) {
    const data = {'@context':['https://w3id.org/ro/crate/1.1/context', {bia:'http://bia/', [alias]:'https://example.org/Other'}], '@graph':[{'@id':'ro-crate-metadata.json','@type':'CreativeWork',conformsTo:{'@id':'https://w3id.org/ro/crate/1.1'},about:{'@id':'./'}},{'@id':'./','@type':['Dataset','bia:Study']}]}
    const result = await importCrate(new Map([['ro-crate-metadata.json',JSON.stringify(data)]]),{metadataPaths:['ro-crate-metadata.json']})
    assert.equal(result.status,'read-only',alias)
  }
})
