import {manifestOutput} from '../manifest/files.js'
import type {CrateFiles} from '@bijux/ro-crate-core'
import {inspectDraft, type DraftDocument, type EntityKind} from '../document/draft.js'
import {stateOf} from '../document/state.js'

export type MaterializeResult = {readonly status: 'materialized'; readonly revision: number; readonly files: CrateFiles} | {readonly status: 'blocked'; readonly revision: number; readonly issues: readonly {readonly code: string; readonly message: string}[]}
const types: Record<EntityKind, string[]> = {
  biosample: ['bia:BioSample'], specimen: ['bia:Specimen'], 'preparation-protocol': ['bia:SpecimenImagingPreparationProtocol'],
  'acquisition-protocol': ['bia:ImageAcquisitionProtocol'], dataset: ['bia:Dataset', 'Dataset'],
}
export function materializeDraft(draft: DraftDocument): MaterializeResult {
  const {revision, study, entities, files} = inspectDraft(draft)
  const source = stateOf(draft).source
  if (source) {
    const preserved = new Map([...source.files].map(([path, bytes]) => [path, new Uint8Array(bytes)]))
    if (source.manifest?.dirty) {
      const cell = (value: string) => /[\t\r\n"]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value
      const rows = [source.manifest.headers, ...source.manifest.rows]
      preserved.set('file_list.tsv', new TextEncoder().encode(rows.map(row => row.map(cell).join('\t')).join('\n') + '\n'))
    }
    if (source.dirty) preserved.set('ro-crate-metadata.json', new TextEncoder().encode(JSON.stringify(source.metadata, null, 2) + '\n'))
    return {status: 'materialized', revision, files: preserved}
  }
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
    ...(files.length ? {csvw: 'http://www.w3.org/ns/csvw#', column: {'@id': 'csvw:column', '@container': '@set'}, columnName: {'@id': 'csvw:name'}, propertyUrl: {'@id': 'csvw:propertyUrl'}, tableSchema: {'@id': 'csvw:tableSchema'}} : {}),
  }
  const nodes = entities.map(({id: entityId, kind, references, ...properties}) => {
    const edges = Object.fromEntries(Object.entries(references).filter(([, ids]) => ids.length > 0).map(([key, ids]) => [key, key === 'associatedSpecimen' ? {'@id': ids[0]} : ids.map(target => ({'@id': target}))]))
    return {'@id': entityId, '@type': types[kind], ...properties, ...edges}
  })
  const datasets = entities.filter(entity => entity.kind === 'dataset').map(entity => ({'@id': entity.id}))
  const manifest = files.length ? manifestOutput(files) : null
  const metadata = {
    '@context': ['https://w3id.org/ro/crate/1.1/context', entities.length ? context : {bia: 'http://bia/'}],
    '@graph': [
      {'@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', conformsTo: {'@id': 'https://w3id.org/ro/crate/1.1'}, about: {'@id': id}},
      {'@id': id, '@type': ['Dataset', 'bia:Study'], ...fields, ...(datasets.length || manifest ? {hasPart: [...datasets, ...(manifest ? [{'@id': 'file_list.tsv'}] : [])]} : {})},
      ...nodes,
      ...(manifest?.nodes ?? []),
    ],
  }
  return {status: 'materialized', revision, files: new Map([['ro-crate-metadata.json', JSON.stringify(metadata, null, 2) + '\n'], ...(manifest ? [['file_list.tsv', manifest.table] as const] : [])])}
}
