import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {applyChange, createDraft, materializeDraft, type DraftChange} from '@bijux/ro-crate-creator'
import type {ValidationIssue} from '@bijux/ro-crate-core'
import {validateMetadata} from '../../src/metadata/validation.js'
import {validateModel} from '../../src/metadata/models/validation.js'
import {rdfDataset} from '../../src/metadata/rdf/dataset.js'

const context: unknown = JSON.parse(readFileSync(new URL('../../../../tests/parity/context.json',import.meta.url),'utf8'))
const documentLoader = async (documentUrl: string) => ({contextUrl:null,documentUrl,document:context})

test('creator contribution metadata roundtrips through pinned BIA models', async () => {
  let draft = createDraft()
  const step = (change: DraftChange) => {const result = applyChange(draft,change); if (result.status !== 'applied') throw Error('creator setup'); draft = result.draft; return result.entityId}
  step({type:'add-study'})
  const contributor = step({type:'add-entity',kind:'contributor'})
  const affiliation = step({type:'add-entity',kind:'affiliation'})
  const publication = step({type:'add-entity',kind:'publication'})
  const grant = step({type:'add-entity',kind:'grant'})
  const funder = step({type:'add-entity',kind:'funding-body'})
  step({type:'set-field',entityId:contributor,field:'name',value:'Researcher'})
  step({type:'set-field',entityId:affiliation,field:'name',value:'Institute'})
  step({type:'set-field',entityId:publication,field:'doi',value:'10.1234/example'})
  step({type:'set-field',entityId:grant,field:'identifier',value:'award'})
  step({type:'set-field',entityId:funder,field:'name',value:'Funder'})
  step({type:'set-roles',entityId:contributor,roles:['Investigation']})
  step({type:'add-reference',sourceId:'./',relationship:'author',targetId:contributor})
  step({type:'add-reference',sourceId:'./',relationship:'relatedPublication',targetId:publication})
  step({type:'add-reference',sourceId:'./',relationship:'funding',targetId:grant})
  step({type:'add-reference',sourceId:contributor,relationship:'memberOf',targetId:affiliation})
  step({type:'add-reference',sourceId:grant,relationship:'funder',targetId:funder})
  const output = materializeDraft(draft)
  if (output.status !== 'materialized') throw Error('materialize')
  const document = JSON.parse(output.files.get('ro-crate-metadata.json') as string) as {'@graph':Array<Record<string,unknown>>}
  const issues: ValidationIssue[] = []
  const parsed = await validateMetadata(document,issues,{documentLoader})
  assert.deepEqual([contributor,affiliation,publication,grant,funder].map(id => parsed.modelTypes.get(id)),['Contributor','Affiliation','Publication','Grant','FundingBody'])
  assert.deepEqual(parsed.entities.get(contributor)?.memberOf,[{'@id':affiliation}])
  assert.deepEqual(parsed.entities.get(contributor)?.role,['Investigation'])
  assert.deepEqual(parsed.entities.get(grant)?.funder,[{'@id':funder}])
  assert.equal(parsed.entities.get(publication)?.doi,'10.1234/example')
  const quads = await rdfDataset(document,{documentLoader})
  for (const [predicate, target] of [['http://schema.org/author',contributor],['http://bia/relatedPublication',publication],['http://schema.org/funding',grant],['http://schema.org/memberOf',affiliation],['http://schema.org/funder',funder]] as const) {
    assert.ok(quads.some(quad => quad.predicate.value === predicate && quad.object.value.endsWith(target)), `Missing RDF relationship ${predicate}`)
  }
  const study = document['@graph'].find(node => node['@id'] === './')!
  const validated = validateModel(study,'http://bia/Study')
  assert.deepEqual(validated.entity.author,[{'@id':contributor}])
  assert.deepEqual(validated.entity.relatedPublication,[{'@id':publication}])
  assert.deepEqual(validated.entity.funding,[{'@id':grant}])
  assert.ok(validated.errors.some(issue => issue.loc[0] === 'accessionId'))
  assert.ok(validated.errors.some(issue => issue.loc[0] === 'datePublished'))
})
