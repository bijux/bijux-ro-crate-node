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
