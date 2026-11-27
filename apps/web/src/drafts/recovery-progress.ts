/** Only the latest editor generation may report its recovery outcome. */
export class RecoveryProgress {
  #generation = 0
  constructor(private readonly report:(message:string) => void) {}
  current() {return this.#generation}
  changed() {this.#generation++; this.report('Changes are not yet saved to browser recovery.'); return this.#generation}
  saved(generation:number) {if (generation === this.#generation) this.report('Recovery copy saved in this browser. Download a backup for another copy.')}
  deleted(generation:number) {if (generation === this.#generation) this.report('Recovery copy deleted.')}
  deleteFailed(generation:number, error:unknown) {if (generation === this.#generation) this.report(`Recovery copy could not be deleted: ${String(error)}`)}
  failed(generation:number, error:unknown) {if (generation === this.#generation) this.report(`Recovery could not save: ${String(error)}. Your current work is still open; download a backup.`)}
}
