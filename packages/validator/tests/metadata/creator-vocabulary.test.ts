import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {applyChange, createDraft, materializeDraft, type DraftChange} from '@bijux/ro-crate-creator'
import {validateMetadata} from '../../src/metadata/validation.js'
import {rdfDataset} from '../../src/metadata/rdf/dataset.js'
import type {ValidationIssue} from '@bijux/ro-crate-core'

const context:unknown = JSON.parse(readFileSync(new URL('../../../../tests/parity/context.json',import.meta.url),'utf8'))
const documentLoader = async (documentUrl:string) => ({contextUrl:null,documentUrl,document:context})
test('creator terms project through pinned BIA models and RDF predicates', async () => {
  let draft = createDraft()
  const step = (change:DraftChange) => {const result = applyChange(draft,change); if (result.status !== 'applied') throw Error('setup'); draft = result.draft; return result.entityId}
  step({type:'add-study'})
  const sample = step({type:'add-entity',kind:'biosample'})
  const protocol = step({type:'add-entity',kind:'acquisition-protocol'})
  step({type:'set-field',entityId:sample,field:'description',value:'sample'})
  step({type:'set-field',entityId:protocol,field:'name',value:'microscopy'})
  step({type:'set-field',entityId:protocol,field:'description',value:'acquisition'})
  step({type:'set-field',entityId:protocol,field:'imagingInstrumentDescription',value:'instrument'})
  step({type:'assign-organism',entityId:sample,previousId:null,identifier:'NCBITaxon:7227',label:'Drosophila melanogaster'})
  step({type:'assign-imaging-method',entityId:protocol,identifier:'FBbi:00000246',label:'light microscopy'})
  const result = materializeDraft(draft); if (result.status !== 'materialized') throw Error()
  const metadata = JSON.parse(result.files.get('ro-crate-metadata.json') as string)
  const issues:ValidationIssue[] = []
  const parsed = await validateMetadata(metadata,issues,{documentLoader})
  const id = 'http://purl.obolibrary.org/obo/NCBITaxon_7227'
  assert.equal(parsed.modelTypes.get(id),'Taxon')
  assert.deepEqual(parsed.entities.get(sample)?.organismClassification,[{'@id':id}])
  assert.equal(parsed.entities.get(id)?.scientificName,'Drosophila melanogaster')
  assert.deepEqual(parsed.entities.get(protocol)?.fbbiId,['FBbi:00000246'])
  assert.deepEqual(parsed.entities.get(protocol)?.imagingMethodName,['light microscopy'])
  const quads = await rdfDataset(metadata,{documentLoader})
  assert.ok(quads.some(quad => quad.predicate.value === 'http://schema.org/taxonomicRange' && quad.object.value === id))
  assert.ok(quads.some(quad => quad.predicate.value === 'http://rs.tdwg.org/dwc/terms/scientificName' && quad.object.value === 'Drosophila melanogaster'))
  assert.ok(quads.some(quad => quad.predicate.value === 'http://bia/fbbiId' && quad.object.value === 'FBbi:00000246'))
  assert.ok(quads.some(quad => quad.predicate.value === 'http://bia/imagingMethodName' && quad.object.value === 'light microscopy'))
})
