import {applyChange, type DraftChange, type EntityKind, type EntityView, type Relationship, type StudyView} from '../document/draft.js'
import {own, type State} from '../document/state.js'
import {fileIssue, type FileRow} from '../manifest/files.js'

const kinds: readonly EntityKind[] = ['biosample','specimen','preparation-protocol','acquisition-protocol','dataset']
const relationships: readonly Relationship[] = ['biologicalEntity','imagingPreparationProtocol','associatedSpecimen','associatedSpecimenImagingPreparationProtocol','associatedImageAcquisitionProtocol']
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const exact = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) => required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key))
const text = (value: unknown): value is string => typeof value === 'string' && value.isWellFormed()
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 1000000000

/** Validate a self-contained fresh draft without trusting its serialized type assertions. */
export function validateFreshState(value: unknown, revision: number, nextId: number): State {
  if (!record(value) || !exact(value, ['study','entities','files']) || !Array.isArray(value.entities) || !Array.isArray(value.files)) throw Error('Invalid draft state')
  let study: StudyView | null = null
  if (value.study !== null) {
    if (!record(value.study) || !exact(value.study, ['id'], ['name','description','license']) || value.study.id !== './' || Object.entries(value.study).some(([key, item]) => key !== 'id' && typeof item !== 'string')) throw Error('Invalid study')
    study = value.study as unknown as StudyView
  }
  if (!study && (value.entities.length || value.files.length || (revision === 0 ? nextId !== 1 : revision <= nextId))) throw Error('Invalid empty draft')
  if (study && revision < nextId) throw Error('Inconsistent revision and allocation counters')
  const entities: EntityView[] = []
  let maximumId = 0
  for (const raw of value.entities) {
    if (!record(raw) || !exact(raw, ['id','kind','references'], ['name','description','imagingInstrumentDescription']) || !text(raw.id) || !/^#entity-[1-9]\d*$/.test(raw.id) || !kinds.includes(raw.kind as EntityKind) || !record(raw.references)) throw Error('Invalid entity')
    const number = Number(raw.id.slice(8))
    if (!positive(number) || entities.some(entity => entity.id === raw.id)) throw Error('Invalid entity identifier')
    maximumId = Math.max(maximumId, number)
    if (Object.entries(raw).some(([key, item]) => ['name','description','imagingInstrumentDescription'].includes(key) && typeof item !== 'string')) throw Error('Invalid entity field')
    if (raw.kind === 'specimen' && (Object.hasOwn(raw,'name') || Object.hasOwn(raw,'description') || Object.hasOwn(raw,'imagingInstrumentDescription'))) throw Error('Unsupported specimen field')
    if (raw.kind !== 'acquisition-protocol' && Object.hasOwn(raw,'imagingInstrumentDescription')) throw Error('Unsupported instrument field')
    for (const [key, targets] of Object.entries(raw.references)) if (!relationships.includes(key as Relationship) || !Array.isArray(targets) || targets.some(target => !text(target))) throw Error('Invalid references')
    entities.push(raw as unknown as EntityView)
  }
  if (nextId <= maximumId) throw Error('Entity allocation counter collides with existing IDs')
  const blank = entities.map(entity => ({...entity, references:{}}))
  let probe = own({revision:0, study, entities:blank, files:[], nextId})
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
