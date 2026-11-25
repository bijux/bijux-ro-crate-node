import {applyChanges, type BulkResult} from '../document/bulk.js'
import {own, stateOf} from '../document/state.js'
import type {DraftChange, DraftDocument} from '../document/draft.js'

const brand: unique symbol = Symbol('history')
export interface DraftHistory {readonly [brand]: never}
interface HistoryState {draft: DraftDocument; past: readonly DraftDocument[]; future: readonly DraftDocument[]; limit: number}
const histories = new WeakMap<DraftHistory, HistoryState>()
function owned(state: HistoryState): DraftHistory {const history = Object.freeze({}) as DraftHistory; histories.set(history, state); return history}
function stateOfHistory(history: DraftHistory): HistoryState {const state = histories.get(history); if (!state) throw new TypeError('Expected a creator history'); return state}
export interface HistoryView {readonly draft: DraftDocument; readonly undoCount: number; readonly redoCount: number; readonly limit: number}
export type HistoryResult = {readonly status:'applied'; readonly history:DraftHistory; readonly entityIds:readonly string[]} | Extract<BulkResult, {status:'rejected'}>
export function createHistory(draft: DraftDocument, options: {readonly limit?: number} = {}): DraftHistory {
  stateOf(draft)
  const limit = options.limit ?? 50
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('History limit must be between 1 and 100')
  return owned({draft, past:[], future:[], limit})
}
export function inspectHistory(history: DraftHistory): HistoryView {const state = stateOfHistory(history); return {draft:state.draft, undoCount:state.past.length, redoCount:state.future.length, limit:state.limit}}
export function applyHistoryChanges(history: DraftHistory, changes: readonly DraftChange[]): HistoryResult {
  const state = stateOfHistory(history)
  const result = applyChanges(state.draft, changes)
  if (result.status === 'rejected') return result
  return {status:'applied', history:owned({...state, draft:result.draft, past:[...state.past, state.draft].slice(-state.limit), future:[]}), entityIds:result.entityIds}
}
function restore(current: DraftDocument, target: DraftDocument): DraftDocument {
  const now = stateOf(current), previous = stateOf(target)
  const source = previous.source && now.source ? {...previous.source, reservedIds:[...new Set([...previous.source.reservedIds, ...now.source.reservedIds])]} : previous.source
  return own({...previous, revision:now.revision + 1, nextId:Math.max(now.nextId, previous.nextId), ...(source ? {source} : {})})
}
export function undo(history: DraftHistory): HistoryResult {
  const state = stateOfHistory(history)
  const target = state.past.at(-1)
  if (!target) return {status:'rejected', index:0, issues:[{code:'no-undo', message:'No earlier state is retained'}]}
  return {status:'applied', history:owned({...state, draft:restore(state.draft, target), past:state.past.slice(0,-1), future:[...state.future, state.draft].slice(-state.limit)}), entityIds:[]}
}
export function redo(history: DraftHistory): HistoryResult {
  const state = stateOfHistory(history)
  const target = state.future.at(-1)
  if (!target) return {status:'rejected', index:0, issues:[{code:'no-redo', message:'No later state is retained'}]}
  return {status:'applied', history:owned({...state, draft:restore(state.draft, target), past:[...state.past, state.draft].slice(-state.limit), future:state.future.slice(0,-1)}), entityIds:[]}
}
