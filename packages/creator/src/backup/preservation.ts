import {identityKey, type ImportedSource} from '../document/state.js'
import {object, sameJSON} from './validate.js'
import {contributionFields, contributionTerms, contributionTypes, type ContributionKind} from '../document/contributions.js'

const kinds: Record<string, {types: readonly string[]; fields: readonly string[]}> = {
  ...Object.fromEntries(Object.entries(contributionTypes).map(([kind, types]) => [types.find(type => type.startsWith('bia:'))!, {types, fields:[...contributionFields[kind as ContributionKind], ...(kind === 'contributor' ? ['memberOf','role'] : kind === 'grant' ? ['funder'] : [])]}])),
  'bia:BioSample': {types:['bia:BioSample'], fields:['name','description']},
  'bia:Specimen': {types:['bia:Specimen'], fields:['biologicalEntity','imagingPreparationProtocol']},
  'bia:SpecimenImagingPreparationProtocol': {types:['bia:SpecimenImagingPreparationProtocol'], fields:['name','description']},
  'bia:ImageAcquisitionProtocol': {types:['bia:ImageAcquisitionProtocol'], fields:['name','description','imagingInstrumentDescription']},
  'bia:Dataset': {types:['bia:Dataset','Dataset'], fields:['name','description','associatedSpecimen','associatedSpecimenImagingPreparationProtocol','associatedImageAcquisitionProtocol']},
}
const addedTerms: Record<string, unknown> = {
  ...contributionTerms,
  biologicalEntity:{'@id':'bia:sampleOf','@container':'@set'}, imagingPreparationProtocol:{'@id':'bia:imagingPreparationProtocol','@container':'@set'},
  associatedSpecimen:{'@id':'bia:associatedSubject'}, associatedSpecimenImagingPreparationProtocol:{'@id':'bia:associatedImagingPreparationProtocol','@container':'@set'},
  associatedImageAcquisitionProtocol:{'@id':'bia:associatedImageAcquisitionProtocol','@container':'@set'}, imagingInstrumentDescription:{'@id':'bia:imagingInstrumentDescription'},
}
const knownColumns = new Set(['file_path','size_in_bytes','dataset','specimen','type','input_image'])
const typeOf = (node: Record<string, unknown>) => {
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
  return types.find(type => typeof type === 'string' && Object.hasOwn(kinds,type)) as string | undefined
}
function unchangedExcept(prior: Record<string, unknown>, latest: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set([...Object.keys(prior),...Object.keys(latest)])
  for (const key of keys) if (!allowed.includes(key) && (!Object.hasOwn(prior,key) || !Object.hasOwn(latest,key) || !sameJSON(prior[key],latest[key]))) return false
  return true
}
/** Verify that edits preserve all content outside the creator's owned operations. */
export function preservesImportedSource(prior: ImportedSource, latest: ImportedSource, nextId: number): boolean {
  const original = prior.metadata, current = latest.metadata
  if (!unchangedExcept(original,current,['@graph','@context'])) return false
  const oldContext = original['@context'], newContext = current['@context']
  if (!Array.isArray(oldContext) || !Array.isArray(newContext) || oldContext.length !== 2 || newContext.length !== 2 || oldContext[0] !== newContext[0] || !object(oldContext[1]) || !object(newContext[1])) return false
  for (const [key, value] of Object.entries(oldContext[1])) if (!Object.hasOwn(newContext[1],key) || !sameJSON(value,newContext[1][key])) return false
  for (const [key, value] of Object.entries(newContext[1])) if (!Object.hasOwn(oldContext[1],key) && (!Object.hasOwn(addedTerms,key) || !sameJSON(value,addedTerms[key]))) return false
  const oldGraph = original['@graph'], newGraph = current['@graph']
  if (!Array.isArray(oldGraph) || !Array.isArray(newGraph) || newGraph.length < oldGraph.length) return false
  for (let index = 0; index < oldGraph.length; index++) {
    const before = oldGraph[index], after = newGraph[index]
    if (!object(before) || !object(after) || before['@id'] !== after['@id']) return false
    const type = typeOf(before)
    const allowed = before['@id'] === './' ? ['name','description','license','fundingStatement','hasPart','author','relatedPublication','funding'] : type ? kinds[type].fields : []
    if (!unchangedExcept(before,after,allowed)) return false
  }
  const additions = newGraph.slice(oldGraph.length)
  const datasets: string[] = []
  for (const node of additions) {
    if (!object(node) || typeof node['@id'] !== 'string' || !/^#entity-[1-9]\d*$/.test(node['@id']) || Number(node['@id'].slice(8)) >= nextId || prior.reservedIds.some(id => identityKey(id) === identityKey(node['@id'] as string))) return false
    const type = typeOf(node)
    if (!type || !sameJSON(node['@type'],kinds[type].types) || Object.keys(node).some(key => key !== '@id' && key !== '@type' && !kinds[type].fields.includes(key))) return false
    if (type === 'bia:Dataset') datasets.push(node['@id'])
  }
  const oldRoot = oldGraph.find(node => object(node) && node['@id'] === './')
  const newRoot = newGraph.find(node => object(node) && node['@id'] === './')
  if (!object(oldRoot) || !object(newRoot)) return false
  const oldParts = oldRoot.hasPart ?? [], newParts = newRoot.hasPart ?? []
  if (!Array.isArray(oldParts) || !Array.isArray(newParts) || !sameJSON(newParts,[...oldParts,...datasets.map(id => ({'@id':id}))])) return false
  const oldManifest = prior.manifest, newManifest = latest.manifest
  if (!!oldManifest !== !!newManifest) return false
  if (oldManifest && newManifest) {
    if (!sameJSON(oldManifest.headers,newManifest.headers) || oldManifest.rows.length !== newManifest.rows.length) return false
    const pathIndex = oldManifest.headers.indexOf('file_path')
    for (let row = 0; row < oldManifest.rows.length; row++) {
      if (oldManifest.rows[row][pathIndex] !== newManifest.rows[row][pathIndex]) return false
      for (let column = 0; column < oldManifest.headers.length; column++) if (!knownColumns.has(oldManifest.headers[column]) && oldManifest.rows[row][column] !== newManifest.rows[row][column]) return false
    }
  }
  return true
}
