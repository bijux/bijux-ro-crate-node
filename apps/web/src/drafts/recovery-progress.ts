export type RecoveryState = 'initial' | 'pending' | 'saved' | 'failed' | 'removed'
export interface RecoverySnapshot {readonly generation:number; readonly state:RecoveryState}
export interface ReplacementPermit {readonly recovery:RecoverySnapshot; readonly editGeneration:number}

/** Only the latest editor generation may report its recovery outcome. */
export class RecoveryProgress {
  #generation = 0
  #state:RecoveryState = 'initial'
  constructor(private readonly report:(message:string) => void) {}
  current() {return this.#generation}
  snapshot():RecoverySnapshot {return {generation:this.#generation,state:this.#state}}
  matches(snapshot:RecoverySnapshot) {return snapshot.generation === this.#generation && snapshot.state === this.#state}
  changed() {this.#generation++; this.#state = 'pending'; this.report('Changes are not yet saved to browser recovery.'); return this.#generation}
  removedCurrent(generation:number) {if (generation === this.#generation) {this.#state = 'removed'; this.report('The current work has no browser recovery copy. New edits will create one; download a backup to keep a separate copy.')}}
  saved(generation:number) {if (generation === this.#generation) {this.#state = 'saved'; this.report('Recovery copy saved in this browser. Download a backup for another copy.')}}
  failed(generation:number, error:unknown) {if (generation === this.#generation) {this.#state = 'failed'; this.report(`Recovery could not save: ${String(error)}. Latest changes are not confirmed in browser recovery. Keep this page open; an editable backup or metadata export may be available.`)}}
}

/** Verify asynchronously, then check caller lifetime and commit without yielding again. */
export async function commitVerifiedReplacement(verify:() => Promise<boolean>, current:() => boolean, commit:() => boolean):Promise<boolean> {
  if (!await verify() || !current()) return false
  return commit()
}

/** Retain unrelated feedback and keep waiting until both recovery operations finish. */
export function recoveryWaitNotice(notice:string, wait:string, pending:boolean, deleting:boolean):string {
  return notice === wait && !pending && !deleting ? '' : notice
}
