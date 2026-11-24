const brand: unique symbol = Symbol('draft')
export interface DraftDocument { readonly [brand]: never }
export type StudyField = 'name' | 'description' | 'license'
export interface StudyView { readonly id: './'; readonly name?: string; readonly description?: string; readonly license?: string }
export type EntityKind = 'biosample' | 'specimen' | 'preparation-protocol' | 'acquisition-protocol' | 'dataset'
export type Relationship = 'biologicalEntity' | 'imagingPreparationProtocol' | 'associatedSpecimen' | 'associatedSpecimenImagingPreparationProtocol' | 'associatedImageAcquisitionProtocol'
export type EntityField = 'name' | 'description' | 'imagingInstrumentDescription'
export interface EntityView { readonly id: string; readonly kind: EntityKind; readonly name?: string; readonly description?: string; readonly imagingInstrumentDescription?: string; readonly references: Readonly<Partial<Record<Relationship, readonly string[]>>> }
export interface IncomingReference { readonly sourceId: string; readonly relationship: Relationship }
export interface DraftView { readonly revision: number; readonly study: StudyView | null; readonly entities: readonly EntityView[] }
export type DraftChange =
  | {readonly type: 'add-study'}
  | {readonly type: 'add-entity'; readonly kind: EntityKind}
  | {readonly type: 'set-field'; readonly entityId: string; readonly field: StudyField | EntityField; readonly value: string | null}
  | {readonly type: 'add-reference' | 'remove-reference'; readonly sourceId: string; readonly relationship: Relationship; readonly targetId: string}
  | {readonly type: 'delete-entity'; readonly entityId: string}
export type ChangeResult = {readonly status: 'applied'; readonly draft: DraftDocument; readonly entityId: string} | {readonly status: 'rejected'; readonly issues: readonly {readonly code: string; readonly message: string}[]; readonly references?: readonly IncomingReference[]}
interface State {revision: number; study: StudyView | null; entities: EntityView[]; nextId: number}
const states = new WeakMap<DraftDocument, State>()
const kinds: readonly EntityKind[] = ['biosample', 'specimen', 'preparation-protocol', 'acquisition-protocol', 'dataset']
const rules: Record<Relationship, {source: EntityKind; target: EntityKind; single?: boolean}> = {
  biologicalEntity: {source: 'specimen', target: 'biosample'},
  imagingPreparationProtocol: {source: 'specimen', target: 'preparation-protocol'},
  associatedSpecimen: {source: 'dataset', target: 'specimen', single: true},
  associatedSpecimenImagingPreparationProtocol: {source: 'dataset', target: 'preparation-protocol'},
  associatedImageAcquisitionProtocol: {source: 'dataset', target: 'acquisition-protocol'},
}
function own(state: State): DraftDocument {const document = Object.freeze({}) as DraftDocument; states.set(document, state); return document}
function stateOf(draft: DraftDocument): State {const state = states.get(draft); if (!state) throw new TypeError('Expected a creator draft document'); return state}
function copyEntity(entity: EntityView): EntityView {
  return {...entity, references: Object.fromEntries(Object.entries(entity.references).map(([key, ids]) => [key, [...ids]]))}
}
export function createDraft(): DraftDocument {return own({revision: 0, study: null, entities: [], nextId: 1})}
export function inspectDraft(draft: DraftDocument): DraftView {const state = stateOf(draft); return {revision: state.revision, study: state.study ? {...state.study} : null, entities: state.entities.map(copyEntity)}}
export function inspectIncomingReferences(draft: DraftDocument, entityId: string): readonly IncomingReference[] {
  const state = stateOf(draft)
  const references: IncomingReference[] = []
  for (const entity of state.entities) for (const [relationship, targets] of Object.entries(entity.references)) {
    if (targets.includes(entityId)) references.push({sourceId: entity.id, relationship: relationship as Relationship})
  }
  return references
}
export function applyChange(draft: DraftDocument, change: DraftChange): ChangeResult {
  const state = stateOf(draft)
  const reject = (code: string, message: string, references?: readonly IncomingReference[]): ChangeResult => ({status: 'rejected', issues: [{code, message}], ...(references ? {references} : {})})
  const accept = (next: Omit<State, 'revision'>, entityId: string): ChangeResult => ({status: 'applied', draft: own({...next, revision: state.revision + 1}), entityId})
  if (!change || typeof change !== 'object') return reject('invalid-change', 'A supported change is required')
  if (change.type === 'add-study') {
    if (state.study) return reject('study-exists', 'The draft already has a study')
    return accept({...state, study: {id: './'}}, './')
  }
  if (change.type === 'add-entity') {
    if (!kinds.includes(change.kind) || Object.hasOwn(change, 'id')) return reject('invalid-change', 'A supported entity kind without a caller-provided ID is required')
    if (!state.study) return reject('missing-study', 'Add a study before adding entities')
    const id = `#entity-${state.nextId}`
    return accept({...state, entities: [...state.entities, {id, kind: change.kind, references: {}}], nextId: state.nextId + 1}, id)
  }
  if (change.type === 'set-field') {
    if (change.value !== null && typeof change.value !== 'string') return reject('invalid-change', 'A string or null value is required')
    if (change.entityId === './') {
      if (!state.study) return reject('unknown-entity', 'The study does not exist')
      if (!['name', 'description', 'license'].includes(change.field)) return reject('invalid-change', 'Unsupported study field')
      const study = {...state.study}
      const field = change.field as StudyField
      if (change.value === null) delete study[field]; else study[field] = change.value
      return accept({...state, study}, './')
    }
    const entity = state.entities.find(item => item.id === change.entityId)
    if (!entity) return reject('unknown-entity', 'The entity does not exist')
    const fields: readonly string[] = entity.kind === 'specimen' ? [] : entity.kind === 'acquisition-protocol' ? ['name', 'description', 'imagingInstrumentDescription'] : ['name', 'description']
    if (!fields.includes(change.field)) return reject('invalid-change', 'Unsupported entity field')
    const updated = {...entity}
    const field = change.field as EntityField
    if (change.value === null) delete updated[field]; else updated[field] = change.value
    return accept({...state, entities: state.entities.map(item => item.id === entity.id ? updated : item)}, entity.id)
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
    if (!source || !target) return reject('unknown-entity', 'Both referenced entities must exist')
    if (!rule || source.kind !== rule.source || target.kind !== rule.target) return reject('invalid-reference', 'Relationship source or target has the wrong type')
    const current = source.references[change.relationship] ?? []
    if (change.type === 'add-reference' && (current.includes(target.id) || (rule.single && current.length))) return reject('duplicate-reference', 'Relationship already has a target')
    if (change.type === 'remove-reference' && !current.includes(target.id)) return reject('unknown-reference', 'The relationship does not exist')
    const next = change.type === 'add-reference' ? [...current, target.id] : current.filter(id => id !== target.id)
    const references = {...source.references, [change.relationship]: next}
    return accept({...state, entities: state.entities.map(item => item.id === source.id ? {...source, references} : item)}, source.id)
  }
  return reject('invalid-change', 'A supported change is required')
}
