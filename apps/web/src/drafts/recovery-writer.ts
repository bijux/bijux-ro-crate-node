import type {RecoveryStore, RecoverySummary} from './recovery-store.js'
type Store = Pick<RecoveryStore, 'save' | 'remove'>

/** Serialize this tab's writes and deletes; other tabs remain protected by store revisions. */
export class RecoveryWriter {
  #revision:number | null = null
  #queue:Promise<void> = Promise.resolve()
  constructor(private id:string, private readonly nextId:() => string) {}
  private enqueue<T>(operation:() => Promise<T>):Promise<T> {
    const result = this.#queue.then(operation)
    this.#queue = result.then(() => {}, () => {})
    return result
  }
  save(store:Store, backup:string) {
    return this.enqueue(async () => {
      const record = await store.save(this.id, this.#revision, backup)
      this.#revision = record.revision
      return record
    })
  }
  remove(store:Store, summary:RecoverySummary) {
    return this.enqueue(async () => {
      const replacement = summary.id === this.id ? this.nextId() : undefined
      await store.remove(summary.id, summary.revision)
      if (replacement) {this.id = replacement; this.#revision = null}
      return replacement !== undefined
    })
  }
}
