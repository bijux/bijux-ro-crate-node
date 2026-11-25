import {fileIssue, type FileRow} from '../manifest/files.js'
import {identityKey, own, stateOf, type State} from './state.js'
import {patchImportedMetadata} from '../import/patch.js'
import {contributionFields, contributionKinds, type ContributionKind, type ContributionField, type ContributionRelationship, type StudyRelationship} from './contributions.js'

const brand: unique symbol = Symbol('draft')
export interface DraftDocument { readonly [brand]: never }
export type StudyField = 'name' | 'description' | 'license' | 'fundingStatement'
export interface StudyView { readonly id: './'; readonly name?: string; readonly description?: string; readonly license?: string; readonly fundingStatement?: string; readonly references?: Readonly<Partial<Record<StudyRelationship, readonly string[]>>> }
export type EntityKind = 'biosample' | 'taxon' | 'specimen' | 'preparation-protocol' | 'acquisition-protocol' | 'dataset' | ContributionKind
export type Relationship = 'organismClassification' | 'biologicalEntity' | 'imagingPreparationProtocol' | 'associatedSpecimen' | 'associatedSpecimenImagingPreparationProtocol' | 'associatedImageAcquisitionProtocol' | StudyRelationship | ContributionRelationship
export type EntityField = 'name' | 'description' | 'imagingInstrumentDescription' | ContributionField
export interface EntityView { readonly id: string; readonly kind: EntityKind; readonly name?: string; readonly label?: string; readonly scientificName?: string; readonly fbbiId?: readonly string[]; readonly imagingMethodName?: readonly string[]; readonly description?: string; readonly imagingInstrumentDescription?: string; readonly address?: string; readonly website?: string; readonly email?: string; readonly authorNames?: string; readonly doi?: string; readonly pubmedId?: string; readonly identifier?: string; readonly role?: readonly string[]; readonly references: Readonly<Partial<Record<Relationship, readonly string[]>>> }
export interface IncomingReference { readonly sourceId: string; readonly relationship: Relationship | 'manifestDataset' | 'manifestSpecimen' }
export interface DraftView { readonly revision: number; readonly study: StudyView | null; readonly entities: readonly EntityView[]; readonly files: readonly FileRow[] }
export type DraftChange =
  | {readonly type:'assign-organism'; readonly entityId:string; readonly previousId:string | null; readonly identifier:string; readonly label:string}
  | {readonly type:'assign-imaging-method'; readonly entityId:string; readonly identifier:string; readonly label:string}
  | {readonly type: 'add-study'}
  | {readonly type: 'add-file' | 'update-file'; readonly file: FileRow}
  | {readonly type: 'delete-file'; readonly path: string}
  | {readonly type: 'add-entity'; readonly kind: EntityKind}
  | {readonly type: 'set-field'; readonly entityId: string; readonly field: StudyField | EntityField; readonly value: string | null}
  | {readonly type: 'add-reference' | 'remove-reference'; readonly sourceId: string; readonly relationship: Relationship; readonly targetId: string}
  | {readonly type: 'delete-entity'; readonly entityId: string}
  | {readonly type: 'set-label'; readonly entityId: string; readonly value: string | null}
  | {readonly type: 'set-roles'; readonly entityId: string; readonly roles: readonly string[]}
  | {readonly type: 'move-author'; readonly entityId: string; readonly index: number}
export type ChangeResult = {readonly status: 'applied'; readonly draft: DraftDocument; readonly entityId: string} | {readonly status: 'rejected'; readonly issues: readonly {readonly code: string; readonly message: string}[]; readonly references?: readonly IncomingReference[]}
const kinds: readonly EntityKind[] = ['biosample', 'taxon', 'specimen', 'preparation-protocol', 'acquisition-protocol', 'dataset', ...contributionKinds]
const rules: Record<Relationship, {source: EntityKind | 'study'; target: EntityKind; single?: boolean}> = {
  author:{source:'study',target:'contributor'}, relatedPublication:{source:'study',target:'publication'}, funding:{source:'study',target:'grant'},
  memberOf:{source:'contributor',target:'affiliation'}, funder:{source:'grant',target:'funding-body'},
  organismClassification: {source:'biosample', target:'taxon'},
  biologicalEntity: {source: 'specimen', target: 'biosample'},
  imagingPreparationProtocol: {source: 'specimen', target: 'preparation-protocol'},
  associatedSpecimen: {source: 'dataset', target: 'specimen', single: true},
  associatedSpecimenImagingPreparationProtocol: {source: 'dataset', target: 'preparation-protocol'},
  associatedImageAcquisitionProtocol: {source: 'dataset', target: 'acquisition-protocol'},
}
function copyEntity(entity: EntityView): EntityView {
  return {...entity, ...(entity.role ? {role:[...entity.role]} : {}), ...(entity.fbbiId ? {fbbiId:[...entity.fbbiId]} : {}), ...(entity.imagingMethodName ? {imagingMethodName:[...entity.imagingMethodName]} : {}), references: Object.fromEntries(Object.entries(entity.references).map(([key, ids]) => [key, [...ids]]))}
}
export function createDraft(): DraftDocument {return own({revision: 0, study: null, entities: [], files: [], nextId: 1})}
export function inspectDraft(draft: DraftDocument): DraftView {const state = stateOf(draft); return {revision: state.revision, study: state.study ? {...state.study, ...(state.study.references ? {references:Object.fromEntries(Object.entries(state.study.references).map(([key, ids]) => [key, [...ids]]))} : {})} : null, entities: state.entities.map(copyEntity), files: state.files.map(file => ({...file}))}}
export function inspectIncomingReferences(draft: DraftDocument, entityId: string): readonly IncomingReference[] {
  const state = stateOf(draft)
  const references: IncomingReference[] = []
  for (const [relationship, targets] of Object.entries(state.study?.references ?? {})) if (targets.includes(entityId)) references.push({sourceId:'./', relationship:relationship as StudyRelationship})
  for (const entity of state.entities) for (const [relationship, targets] of Object.entries(entity.references)) {
    if (targets.includes(entityId)) references.push({sourceId: entity.id, relationship: relationship as Relationship})
  }
  for (const file of state.files) {
    if (file.datasetId === entityId) references.push({sourceId: file.path, relationship: 'manifestDataset'})
    if (file.specimenId === entityId) references.push({sourceId: file.path, relationship: 'manifestSpecimen'})
  }
  return references
}
export function applyChange(draft: DraftDocument, change: DraftChange): ChangeResult {
  const state = stateOf(draft)
  const reject = (code: string, message: string, references?: readonly IncomingReference[]): ChangeResult => ({status: 'rejected', issues: [{code, message}], ...(references ? {references} : {})})
  const accept = (next: Omit<State, 'revision'>, entityId: string): ChangeResult => ({status: 'applied', draft: own({...next, ...(state.source && change.type !== 'set-label' ? {source: patchImportedMetadata(state.source, change, entityId)} : {}), revision: state.revision + 1}), entityId})
  if (!change || typeof change !== 'object') return reject('invalid-change', 'A supported change is required')
  if (state.source && (change.type === 'add-file' || change.type === 'delete-file' || change.type === 'delete-entity')) return reject('incomplete-reference-inventory', 'This operation is unavailable for imported content because preserved references may be unknown')
  if (change.type === 'add-file' || change.type === 'update-file') {
    if (!state.study || !change.file || typeof change.file !== 'object') return reject('invalid-change', 'A study and file row are required')
    const existing = state.files.some(file => file.path === change.file.path)
    if (change.type === 'add-file' && existing) return reject('duplicate-file', 'File path already exists')
    if (change.type === 'update-file' && !existing) return reject('unknown-file', 'File path does not exist')
    const {path, size, datasetId, specimenId, type, sourceImage} = change.file
    const file: FileRow = {path, size, datasetId, specimenId, type, ...(sourceImage === undefined ? {} : {sourceImage})}
    const files = change.type === 'add-file' ? [...state.files, file] : state.files.map(row => row.path === path ? file : row)
    const issue = fileIssue(files, state.entities)
    if (issue) return reject('invalid-file', issue)
    return accept({...state, files}, path)
  }
  if (change.type === 'delete-file') {
    if (!state.files.some(file => file.path === change.path)) return reject('unknown-file', 'File path does not exist')
    const files = state.files.filter(file => file.path !== change.path)
    const issue = fileIssue(files, state.entities)
    if (issue) return reject('referenced-file', issue)
    return accept({...state, files}, change.path)
  }
  if (change.type === 'add-study') {
    if (state.study) return reject('study-exists', 'The draft already has a study')
    return accept({...state, study: {id: './'}}, './')
  }
  if (change.type === 'add-entity') {
    if (!kinds.includes(change.kind) || change.kind === 'taxon' || Object.hasOwn(change, 'id')) return reject('invalid-change', 'A supported entity kind without a caller-provided ID is required')
    if (!state.study) return reject('missing-study', 'Add a study before adding entities')
    let nextId = state.nextId
    while (state.source?.reservedIds.some(id => identityKey(id) === identityKey(`#entity-${nextId}`))) nextId++
    const id = `#entity-${nextId}`
    return accept({...state, entities: [...state.entities, {id, kind: change.kind, references: {}}], nextId: nextId + 1}, id)
  }
  if (change.type === 'assign-organism') {
    const sample = state.entities.find(item => item.id === change.entityId && item.kind === 'biosample')
    if (!sample || typeof change.identifier !== 'string' || !/^NCBITaxon:\d{1,12}$/.test(change.identifier) || typeof change.label !== 'string' || !change.label.trim() || (change.previousId !== null && typeof change.previousId !== 'string')) return reject('invalid-term', 'A biosample, taxonomy identifier and label are required')
    const id = `http://purl.obolibrary.org/obo/${change.identifier.replace(':','_')}`
    const current = sample.references.organismClassification ?? []
    if (change.previousId !== null && !current.includes(change.previousId)) return reject('unknown-term', 'The organism to replace does not exist')
    if (current.includes(id) && change.previousId !== id) return reject('duplicate-term', 'The organism is already assigned')
    const existing = state.entities.find(item => item.id === id)
    if (existing && (existing.kind !== 'taxon' || (existing.scientificName !== change.label && change.previousId !== id))) return reject('conflicting-term', 'This identifier already has a different record or name')
    if (!existing && state.source?.reservedIds.some(item => identityKey(item) === identityKey(id))) return reject('conflicting-term', 'This identifier is reserved by imported content')
    const targets = change.previousId === null ? [...current,id] : current.map(item => item === change.previousId ? id : item)
    const updated = {...sample,references:{...sample.references,organismClassification:targets}}
    const entities = state.entities.map(item => item.id === sample.id ? updated : item.id === id && item.kind === 'taxon' ? {...item,scientificName:change.label} : item)
    if (!existing) entities.push({id,kind:'taxon',scientificName:change.label,references:{}})
    return accept({...state,entities},sample.id)
  }
  if (change.type === 'assign-imaging-method') {
    const entity = state.entities.find(item => item.id === change.entityId && item.kind === 'acquisition-protocol')
    if (!entity || typeof change.identifier !== 'string' || typeof change.label !== 'string' || !change.label.trim() || (entity.fbbiId?.length ?? 0) > 1 || (entity.imagingMethodName?.length ?? 0) > 1) return reject('invalid-term', 'A protocol with at most one existing method and a label are required')
    const updated = {...entity,fbbiId:change.identifier ? [change.identifier] : [],imagingMethodName:[change.label]}
    return accept({...state,entities:state.entities.map(item => item.id === entity.id ? updated : item)},entity.id)
  }
  if (change.type === 'set-field') {
    if (change.value !== null && typeof change.value !== 'string') return reject('invalid-change', 'A string or null value is required')
    if (change.entityId === './') {
      if (!state.study) return reject('unknown-entity', 'The study does not exist')
      if (!['name', 'description', 'license', 'fundingStatement'].includes(change.field)) return reject('invalid-change', 'Unsupported study field')
      const study = {...state.study}
      const field = change.field as StudyField
      if (change.value === null) delete study[field]; else study[field] = change.value
      return accept({...state, study}, './')
    }
    const entity = state.entities.find(item => item.id === change.entityId)
    if (!entity) return reject('unknown-entity', 'The entity does not exist')
    const fields: readonly string[] = Object.hasOwn(contributionFields, entity.kind) ? contributionFields[entity.kind as ContributionKind] : entity.kind === 'specimen' || entity.kind === 'taxon' ? [] : entity.kind === 'acquisition-protocol' ? ['name', 'description', 'imagingInstrumentDescription'] : ['name', 'description']
    if (!fields.includes(change.field)) return reject('invalid-change', 'Unsupported entity field')
    const updated = {...entity}
    const field = change.field as EntityField
    if (change.value === null) delete updated[field]; else updated[field] = change.value
    return accept({...state, entities: state.entities.map(item => item.id === entity.id ? updated : item)}, entity.id)
  }
  if (change.type === 'set-label') {
    const entity = state.entities.find(item => item.id === change.entityId)
    if (!entity || entity.kind !== 'specimen' || (change.value !== null && typeof change.value !== 'string')) return reject('invalid-label', 'A specimen and string or null label are required')
    const updated = {...entity}
    if (change.value === null) delete updated.label; else updated.label = change.value
    return accept({...state, entities:state.entities.map(item => item.id === entity.id ? updated : item)}, entity.id)
  }
  if (change.type === 'set-roles') {
    const entity = state.entities.find(item => item.id === change.entityId)
    if (!entity || entity.kind !== 'contributor' || !Array.isArray(change.roles) || change.roles.some(role => typeof role !== 'string')) return reject('invalid-roles', 'A contributor and string roles are required')
    return accept({...state, entities:state.entities.map(item => item.id === entity.id ? {...entity, role:[...change.roles]} : item)}, entity.id)
  }
  if (change.type === 'move-author') {
    const authors = state.study?.references?.author ?? []
    const previous = authors.indexOf(change.entityId)
    if (previous < 0 || !Number.isInteger(change.index) || change.index < 0 || change.index >= authors.length) return reject('invalid-author-order', 'Author and destination must exist')
    const next = [...authors]; next.splice(previous, 1); next.splice(change.index, 0, change.entityId)
    return accept({...state, study:{...state.study!, references:{...state.study!.references, author:next}}}, './')
  }
  if (change.type === 'delete-entity') {
    if (!state.entities.some(item => item.id === change.entityId)) return reject('unknown-entity', 'The entity does not exist')
    const references = inspectIncomingReferences(draft, change.entityId)
    if (references.length) return reject('referenced-entity', 'Remove incoming references before deletion', references)
    return accept({...state, entities: state.entities.filter(item => item.id !== change.entityId)}, change.entityId)
  }
  if (change.type === 'add-reference' || change.type === 'remove-reference') {
    const rule = Object.hasOwn(rules, change.relationship) ? rules[change.relationship] : undefined
    const source = state.entities.find(item => item.id === change.sourceId)
    const target = state.entities.find(item => item.id === change.targetId)
    const isStudy = change.sourceId === './' && !!state.study
    if ((!source && !isStudy) || !target) return reject('unknown-entity', 'Both referenced entities must exist')
    if (!rule || (isStudy ? rule.source !== 'study' : source?.kind !== rule.source) || target.kind !== rule.target) return reject('invalid-reference', 'Relationship source or target has the wrong type')
    const current = isStudy ? state.study?.references?.[change.relationship as StudyRelationship] ?? [] : source!.references[change.relationship] ?? []
    if (change.type === 'add-reference' && (current.includes(target.id) || (rule.single && current.length))) return reject('duplicate-reference', 'Relationship already has a target')
    if (change.type === 'remove-reference' && !current.includes(target.id)) return reject('unknown-reference', 'The relationship does not exist')
    const next = change.type === 'add-reference' ? [...current, target.id] : current.filter(id => id !== target.id)
    if (isStudy) {
      const references = {...state.study!.references, [change.relationship]:next}
      if (!next.length) delete references[change.relationship as StudyRelationship]
      const study = {...state.study!}; if (Object.keys(references).length) study.references = references; else delete study.references
      return accept({...state, study}, './')
    }
    const references = {...source!.references, [change.relationship]: next}
    return accept({...state, entities: state.entities.map(item => item.id === source!.id ? {...source!, references} : item)}, source!.id)
  }
  return reject('invalid-change', 'A supported change is required')
}
