const brand: unique symbol = Symbol('draft')
export interface DraftDocument { readonly [brand]: never }
export type StudyField = 'name' | 'description' | 'license'
export interface StudyView { readonly id: './'; readonly name?: string; readonly description?: string; readonly license?: string }
export interface DraftView { readonly revision: number; readonly study: StudyView | null }
export type DraftChange = {readonly type: 'add-study'} | {readonly type: 'set-field'; readonly entityId: string; readonly field: StudyField; readonly value: string | null}
export type ChangeResult = {readonly status: 'applied'; readonly draft: DraftDocument; readonly entityId: './'} | {readonly status: 'rejected'; readonly issues: readonly {readonly code: string; readonly message: string}[]}

interface State {revision: number; study: StudyView | null}
const states = new WeakMap<DraftDocument, State>()
function own(state: State): DraftDocument {
  const document = Object.freeze({}) as DraftDocument
  states.set(document, state)
  return document
}
function stateOf(draft: DraftDocument): State {
  const state = states.get(draft)
  if (!state) throw new TypeError('Expected a creator draft document')
  return state
}
export function createDraft(): DraftDocument {return own({revision: 0, study: null})}
export function inspectDraft(draft: DraftDocument): DraftView {
  const state = stateOf(draft)
  return {revision: state.revision, study: state.study ? {...state.study} : null}
}
export function applyChange(draft: DraftDocument, change: DraftChange): ChangeResult {
  const state = stateOf(draft)
  const reject = (code: string, message: string): ChangeResult => ({status: 'rejected', issues: [{code, message}]})
  if (!change || typeof change !== 'object') return reject('invalid-change', 'A supported change is required')
  if (change.type === 'add-study') {
    if (state.study) return reject('study-exists', 'The draft already has a study')
    return {status: 'applied', draft: own({revision: state.revision + 1, study: {id: './'}}), entityId: './'}
  }
  if (change.type !== 'set-field' || !['name', 'description', 'license'].includes(change.field) || (change.value !== null && typeof change.value !== 'string'))
    return reject('invalid-change', 'A supported field and string or null value are required')
  if (!state.study || change.entityId !== './') return reject('unknown-entity', 'The study does not exist')
  const study = {...state.study}
  if (change.value === null) delete study[change.field]
  else study[change.field] = change.value
  return {status: 'applied', draft: own({revision: state.revision + 1, study}), entityId: './'}
}
