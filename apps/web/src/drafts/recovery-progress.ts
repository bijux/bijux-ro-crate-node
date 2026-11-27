/** Only the latest editor generation may report its recovery outcome. */
export class RecoveryProgress {
  #generation = 0
  constructor(private readonly report:(message:string) => void) {}
  current() {return this.#generation}
  changed() {this.#generation++; this.report('Changes are not yet saved to browser recovery.'); return this.#generation}
  removedCurrent(generation:number) {if (generation === this.#generation) this.report('The current work has no browser recovery copy. New edits will create one; download a backup to keep a separate copy.')}
  saved(generation:number) {if (generation === this.#generation) this.report('Recovery copy saved in this browser. Download a backup for another copy.')}
  failed(generation:number, error:unknown) {if (generation === this.#generation) this.report(`Recovery could not save: ${String(error)}. Your current work is still open; download a backup.`)}
}
