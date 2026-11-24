import type {CrateFiles} from '@bijux/ro-crate-core'
import {inspectDraft, type DraftDocument, type EntityKind} from '../document/draft.js'

export type MaterializeResult = {readonly status: 'materialized'; readonly revision: number; readonly files: CrateFiles} | {readonly status: 'blocked'; readonly revision: number; readonly issues: readonly {readonly code: string; readonly message: string}[]}
const types: Record<EntityKind, string[]> = {
  biosample: ['bia:BioSample'], specimen: ['bia:Specimen'], 'preparation-protocol': ['bia:SpecimenImagingPreparationProtocol'],
  'acquisition-protocol': ['bia:ImageAcquisitionProtocol'], dataset: ['bia:Dataset', 'Dataset'],
}
export function materializeDraft(draft: DraftDocument): MaterializeResult {
  const {revision, study, entities} = inspectDraft(draft)
  if (!study) return {status: 'blocked', revision, issues: [{code: 'missing-study', message: 'Add a study before exporting metadata'}]}
  const {id, ...fields} = study
  const context = {
    bia: 'http://bia/',
    biologicalEntity: {'@id': 'bia:sampleOf', '@container': '@set'},
    imagingPreparationProtocol: {'@id': 'bia:imagingPreparationProtocol', '@container': '@set'},
    associatedSpecimen: {'@id': 'bia:associatedSubject'},
    associatedSpecimenImagingPreparationProtocol: {'@id': 'bia:associatedImagingPreparationProtocol', '@container': '@set'},
    associatedImageAcquisitionProtocol: {'@id': 'bia:associatedImageAcquisitionProtocol', '@container': '@set'},
    imagingInstrumentDescription: {'@id': 'bia:imagingInstrumentDescription'},
  }
  const nodes = entities.map(({id: entityId, kind, references, ...properties}) => {
    const edges = Object.fromEntries(Object.entries(references).filter(([, ids]) => ids.length > 0).map(([key, ids]) => [key, key === 'associatedSpecimen' ? {'@id': ids[0]} : ids.map(target => ({'@id': target}))]))
    return {'@id': entityId, '@type': types[kind], ...properties, ...edges}
  })
  const datasets = entities.filter(entity => entity.kind === 'dataset').map(entity => ({'@id': entity.id}))
  const metadata = {
    '@context': ['https://w3id.org/ro/crate/1.1/context', entities.length ? context : {bia: 'http://bia/'}],
    '@graph': [
      {'@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', conformsTo: {'@id': 'https://w3id.org/ro/crate/1.1'}, about: {'@id': id}},
      {'@id': id, '@type': ['Dataset', 'bia:Study'], ...fields, ...(datasets.length ? {hasPart: datasets} : {})},
      ...nodes,
    ],
  }
  return {status: 'materialized', revision, files: new Map([['ro-crate-metadata.json', JSON.stringify(metadata, null, 2) + '\n']])}
}
