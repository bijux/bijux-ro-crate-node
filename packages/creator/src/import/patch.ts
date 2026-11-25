import type {DraftChange, EntityKind} from '../document/draft.js'
import type {ImportedSource} from '../document/state.js'

const types: Record<EntityKind, string[]> = {
  biosample: ['bia:BioSample'], specimen: ['bia:Specimen'], 'preparation-protocol': ['bia:SpecimenImagingPreparationProtocol'],
  'acquisition-protocol': ['bia:ImageAcquisitionProtocol'], dataset: ['bia:Dataset', 'Dataset'],
}
const contextTerms: Record<string, unknown> = {
  biologicalEntity: {'@id': 'bia:sampleOf', '@container': '@set'},
  imagingPreparationProtocol: {'@id': 'bia:imagingPreparationProtocol', '@container': '@set'},
  associatedSpecimen: {'@id': 'bia:associatedSubject'},
  associatedSpecimenImagingPreparationProtocol: {'@id': 'bia:associatedImagingPreparationProtocol', '@container': '@set'},
  associatedImageAcquisitionProtocol: {'@id': 'bia:associatedImageAcquisitionProtocol', '@container': '@set'},
  imagingInstrumentDescription: {'@id': 'bia:imagingInstrumentDescription'},
}
export function patchImportedMetadata(source: ImportedSource, change: DraftChange, entityId: string): ImportedSource {
  const metadata = structuredClone(source.metadata)
  const graph = metadata['@graph'] as Record<string, unknown>[]
  const context = (metadata['@context'] as [string, Record<string, unknown>])[1]
  if (change.type === 'update-file' && source.manifest) {
    const rows = source.manifest.rows.map(row => [...row])
    const columns = source.manifest.headers
    const row = rows.find(item => item[columns.indexOf('file_path')] === change.file.path)!
    for (const [key, value] of Object.entries({size_in_bytes:change.file.size, dataset:change.file.datasetId, specimen:change.file.specimenId, type:change.file.type === 'image' ? 'http://bia/Image' : 'http://bia/AnnotationData', input_image:change.file.sourceImage ?? ''})) row[columns.indexOf(key)] = value
    return {...source, manifest:{headers:columns, rows, dirty:true}}
  }
  if (change.type === 'set-field') {
    const node = graph.find(item => item['@id'] === entityId)!
    if (change.value === null) delete node[change.field]; else node[change.field] = change.value
    if (change.field === 'imagingInstrumentDescription') context[change.field] ??= contextTerms[change.field]
  } else if (change.type === 'add-entity') {
    graph.push({'@id': entityId, '@type': types[change.kind]})
    if (change.kind === 'dataset') {
      const study = graph.find(item => item['@id'] === './')!
      const parts = (study.hasPart ?? []) as Array<{'@id': string}>
      study.hasPart = [...parts, {'@id': entityId}]
    }
  } else if (change.type === 'add-reference' || change.type === 'remove-reference') {
    const node = graph.find(item => item['@id'] === change.sourceId)!
    context[change.relationship] ??= contextTerms[change.relationship]
    if (change.relationship === 'associatedSpecimen') {
      if (change.type === 'add-reference') node[change.relationship] = {'@id': change.targetId}
      else delete node[change.relationship]
    } else {
      const references = (node[change.relationship] ?? []) as Array<{'@id': string}>
      const next = change.type === 'add-reference' ? [...references, {'@id': change.targetId}] : references.filter(item => item['@id'] !== change.targetId)
      if (next.length) node[change.relationship] = next; else delete node[change.relationship]
    }
  }
  return {...source, metadata, dirty: true, reservedIds: change.type === 'add-entity' ? [...source.reservedIds, entityId] : source.reservedIds}
}
