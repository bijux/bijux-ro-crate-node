import type {DraftDocument, EntityView, StudyView} from './draft.js'
import type {FileRow} from '../manifest/files.js'

export interface ImportedSource {
  readonly files: ReadonlyMap<string, Uint8Array>
  readonly metadata: Record<string, unknown>
  readonly dirty: boolean
  readonly reservedIds: readonly string[]
  readonly manifest?: {readonly headers: readonly string[]; readonly rows: readonly (readonly string[])[]; readonly dirty: boolean}
}
export interface State {revision: number; study: StudyView | null; entities: EntityView[]; files: FileRow[]; nextId: number; source?: ImportedSource}
const states = new WeakMap<DraftDocument, State>()
export function own(state: State): DraftDocument {const document = Object.freeze({}) as DraftDocument; states.set(document, state); return document}
export function stateOf(draft: DraftDocument): State {const state = states.get(draft); if (!state) throw new TypeError('Expected a creator draft document'); return state}

/** Compare local identifiers after URI resolution and escape decoding. */
export function identityKey(value: string): string {
  try {return decodeURIComponent(new URL(value, 'https://creator.invalid/').href)} catch {return value}
}
