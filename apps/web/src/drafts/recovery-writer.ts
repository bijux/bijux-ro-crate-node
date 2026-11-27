import type {RecoveryStore, RecoverySummary} from './recovery-store.js'
type Store = Pick<RecoveryStore, 'save' | 'remove'>
export interface WriterVersion {readonly id:string; readonly revision:number}

/** Serialize this tab's writes and deletes; other tabs remain protected by store revisions. */
export class RecoveryWriter {
  #revision:number | null = null
  #queue:Promise<void> = Promise.resolve()
  #pending = 0
  constructor(private id:string, private readonly nextId:() => string) {}
  private enqueue<T>(operation:() => Promise<T>):Promise<T> {
    this.#pending++
    const result = this.#queue.then(operation).finally(() => {this.#pending--})
    this.#queue = result.then(() => {}, () => {})
    return result
  }
  version():WriterVersion | null {return this.#revision === null ? null : {id:this.id,revision:this.#revision}}
  matches(version:WriterVersion) {return version.id === this.id && version.revision === this.#revision}
  fork() {if (this.#pending) throw Error('Browser recovery is still writing'); const next = this.nextId(); if (next === this.id) throw Error('A distinct recovery copy is required'); this.id = next; this.#revision = null}
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
