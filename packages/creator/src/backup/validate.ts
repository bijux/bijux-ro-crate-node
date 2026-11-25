import {applyChange, type DraftChange, type EntityKind, type EntityView, type Relationship, type StudyView} from '../document/draft.js'
import {own, type State} from '../document/state.js'
import {fileIssue, type FileRow} from '../manifest/files.js'
import {contributionFields, contributionKinds, type ContributionKind, type StudyRelationship} from '../document/contributions.js'

const kinds: readonly EntityKind[] = ['biosample','taxon','specimen','preparation-protocol','acquisition-protocol','dataset',...contributionKinds]
const relationships: readonly Relationship[] = ['organismClassification','biologicalEntity','imagingPreparationProtocol','associatedSpecimen','associatedSpecimenImagingPreparationProtocol','associatedImageAcquisitionProtocol','author','relatedPublication','funding','memberOf','funder']
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const exact = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) => required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key))
const text = (value: unknown): value is string => typeof value === 'string' && value.isWellFormed()
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 1000000000

/** Validate a self-contained fresh draft without trusting its serialized type assertions. */
export function validateFreshState(value: unknown, revision: number, nextId: number): State {
  if (!record(value) || !exact(value, ['study','entities','files']) || !Array.isArray(value.entities) || !Array.isArray(value.files)) throw Error('Invalid draft state')
  let study: StudyView | null = null
  if (value.study !== null) {
    if (!record(value.study) || !exact(value.study, ['id'], ['name','description','license','fundingStatement','references']) || value.study.id !== './' || Object.entries(value.study).some(([key, item]) => key !== 'id' && key !== 'references' && typeof item !== 'string')) throw Error('Invalid study')
    if (value.study.references !== undefined && (!record(value.study.references) || Object.entries(value.study.references).some(([key, targets]) => !['author','relatedPublication','funding'].includes(key) || !Array.isArray(targets) || targets.some(target => !text(target))))) throw Error('Invalid study references')
    study = value.study as unknown as StudyView
  }
  if (!study && (value.entities.length || value.files.length || (revision === 0 ? nextId !== 1 : revision <= nextId))) throw Error('Invalid empty draft')
  if (study && revision < nextId) throw Error('Inconsistent revision and allocation counters')
  const entities: EntityView[] = []
  let maximumId = 0
  for (const raw of value.entities) {
    if (!record(raw) || !exact(raw, ['id','kind','references'], ['name','description','imagingInstrumentDescription','address','website','email','authorNames','doi','pubmedId','identifier','role','label','scientificName','fbbiId','imagingMethodName']) || !text(raw.id) || !(raw.kind === 'taxon' ? /^http:\/\/purl\.obolibrary\.org\/obo\/NCBITaxon_\d{1,12}$/.test(raw.id) : /^#entity-[1-9]\d*$/.test(raw.id)) || !kinds.includes(raw.kind as EntityKind) || !record(raw.references)) throw Error('Invalid entity')
    const number = raw.kind === 'taxon' ? 0 : Number(raw.id.slice(8))
    if ((raw.kind !== 'taxon' && !positive(number)) || entities.some(entity => entity.id === raw.id)) throw Error('Invalid entity identifier')
    maximumId = Math.max(maximumId, number)
    const fields = Object.hasOwn(contributionFields,raw.kind as string) ? contributionFields[raw.kind as ContributionKind] : raw.kind === 'taxon' ? ['scientificName'] : raw.kind === 'specimen' ? [] : raw.kind === 'acquisition-protocol' ? ['name','description','imagingInstrumentDescription'] : ['name','description']
    if (raw.label !== undefined && (raw.kind !== 'specimen' || typeof raw.label !== 'string')) throw Error('Invalid authoring label')
    if (raw.role !== undefined && (raw.kind !== 'contributor' || !Array.isArray(raw.role) || raw.role.some(item => typeof item !== 'string'))) throw Error('Invalid contributor roles')
    if (['fbbiId','imagingMethodName'].some(key => raw[key] !== undefined && (raw.kind !== 'acquisition-protocol' || !Array.isArray(raw[key]) || (raw[key] as unknown[]).some(item => !text(item))))) throw Error('Invalid imaging terms')
    if (Object.entries(raw).some(([key, item]) => !['id','kind','references','role','label','fbbiId','imagingMethodName'].includes(key) && (!fields.includes(key) || typeof item !== 'string'))) throw Error('Invalid entity field')
    for (const [key, targets] of Object.entries(raw.references)) if (!relationships.includes(key as Relationship) || !Array.isArray(targets) || targets.some(target => !text(target))) throw Error('Invalid references')
    entities.push(raw as unknown as EntityView)
  }
  if (nextId <= maximumId) throw Error('Entity allocation counter collides with existing IDs')
  const blank = entities.map(entity => ({...entity, references:{}}))
  const emptyStudy = study ? {...study} : null
  if (emptyStudy) delete emptyStudy.references
  let probe = own({revision:0, study:emptyStudy, entities:blank, files:[], nextId})
  for (const [relationship, targets] of Object.entries(study?.references ?? {}) as Array<[StudyRelationship,readonly string[]]>) for (const targetId of targets) {
    const result = applyChange(probe, {type:'add-reference',sourceId:'./',relationship,targetId})
    if (result.status !== 'applied') throw Error('Invalid study reference')
    probe = result.draft
  }
  for (const entity of entities) for (const [relationship, targets] of Object.entries(entity.references)) for (const targetId of targets) {
    const change: DraftChange = {type:'add-reference', sourceId:entity.id, relationship:relationship as Relationship, targetId}
    const result = applyChange(probe, change)
    if (result.status !== 'applied') throw Error('Invalid entity reference')
    probe = result.draft
  }
  for (const row of value.files) {
    if (!record(row) || !exact(row, ['path','size','datasetId','specimenId','type'], ['sourceImage']) || Object.values(row).some(item => !text(item))) throw Error('Invalid file row')
  }
  const files = value.files as unknown as FileRow[]
  const issue = fileIssue(files, entities)
  if (issue) throw Error(issue)
  return {revision, study, entities, files, nextId}
}
export function counter(value: unknown, minimum: number): value is number {return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= 1000000000}
export function object(value: unknown): value is Record<string, unknown> {return record(value)}
export function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {return exact(value, required, optional)}
export function sameJSON(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => sameJSON(item, right[index]))
  if (!record(left) || !record(right)) return false
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right,key) && sameJSON(left[key], right[key]))
}
