import type {DraftView} from '@bijux/ro-crate-creator'


export const RECOVERY_MAX_PENDING = 100_000
export const RECOVERY_MAX_PATH_BYTES = 4096
const pathEncoder = new TextEncoder()
export const wellFormedText = (value:string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)
export function validatePendingCount(count:number):void {
  if (count > RECOVERY_MAX_PENDING) throw Error('Too many pending file listings; keep at most 100,000 and assign or remove some before adding more.')
}
export function validatePendingPath(path:unknown): asserts path is string {
  if (typeof path !== 'string' || !wellFormedText(path) || !path || path.length > RECOVERY_MAX_PATH_BYTES || pathEncoder.encode(path).length > RECOVERY_MAX_PATH_BYTES)
    throw Error('Invalid pending listing path; use a non-empty path of at most 4096 UTF-8 bytes.')
}

/** A staged listing describes a file without holding its payload. */
export interface PendingFile {readonly id:string; readonly path:string; readonly size:string}

/** Unapplied text for one vocabulary control, retained independently of evidence. */
export interface PendingTerm {
  readonly kind:'taxonomy' | 'imaging'
  readonly entityId:string
  readonly previousId:string | null
  readonly identifier:string
  readonly label:string
}
export type TermSlot = Pick<PendingTerm,'kind' | 'entityId' | 'previousId'>
export function sameTermSlot(left:TermSlot, right:TermSlot):boolean {
  return left.kind === right.kind && left.entityId === right.entityId && left.previousId === right.previousId
}

/** The editor exposes only referenced Taxa and single-valued imaging controls. */
export function editableTermSlot(view:DraftView, slot:TermSlot):boolean {
  const entity = view.entities.find(item => item.id === slot.entityId)
  if (slot.kind === 'imaging') return entity?.kind === 'acquisition-protocol' && slot.previousId === null && (entity.fbbiId?.length ?? 0) <= 1 && (entity.imagingMethodName?.length ?? 0) <= 1
  if (entity?.kind !== 'biosample') return false
  if (slot.previousId === null) return true
  return (entity.references.organismClassification ?? []).includes(slot.previousId) && view.entities.some(item => item.id === slot.previousId && item.kind === 'taxon')
}
