import {materializeDraft, type DraftDocument} from '@bijux/ro-crate-creator'
import type {SessionSnapshot, ValidatedSnapshot, ValidationSession} from '@bijux/ro-crate-validator/browser'

type Files = Parameters<ValidationSession['select']>[0]
type Selection = ReadonlyMap<string, Blob>
export type ValidationStatus = {readonly state: SessionSnapshot['state'] | 'blocked'; readonly eligible: boolean; readonly message?: string; readonly result?: SessionSnapshot['result']}

/** Binds one complete creator snapshot and detached payload selection to a session revision. */
export class ValidationCoordinator {
  #binding: {creatorRevision: number; selection: number; session: string; revision: number} | undefined
  #selection = 0
  #status: ValidationStatus = {state: 'blocked', eligible: false}
  #unsubscribe: () => void
  #disposed = false
  constructor(private readonly session: ValidationSession, private readonly changed: (status: ValidationStatus) => void = () => {}) {
    this.#unsubscribe = session.subscribe(state => this.#receive(state))
  }
  snapshot(): ValidationStatus {return this.#status}
  #set(status: ValidationStatus) {this.#status = status; this.changed(status)}
  #receive(state: SessionSnapshot) {
    const binding = this.#binding
    if (!binding || state.session !== binding.session || state.revision !== binding.revision || this.#disposed) return
    this.#set({state: state.state, eligible: state.eligible, result: state.result})
  }
  block(message: string) {
    if (this.#disposed) throw new Error('Validation coordinator is disposed')
    const identity = ++this.#selection
    this.#binding = undefined
    this.#set({state: 'blocked', eligible: false, message})
    if (!this.#disposed && identity === this.#selection) this.session.cancel()
  }
  update(draft: DraftDocument, selection: Selection) {
    if (this.#disposed) throw new Error('Validation coordinator is disposed')
    const identity = ++this.#selection
    this.#binding = undefined
    this.#set({state: 'editing', eligible: false})
    if (this.#disposed || identity !== this.#selection) return
    this.session.cancel()
    if (this.#disposed || identity !== this.#selection) return
    try {
      const materialized = materializeDraft(draft)
      if (materialized.status === 'blocked') {this.#set({state: 'blocked', eligible: false, message: materialized.issues.map(issue => issue.message).join('; ')}); return}
      const files = new Map(materialized.files)
      for (const [path, file] of selection) {
        if (files.has(path)) throw new Error(`Selected payload conflicts with generated metadata: ${path}`)
        files.set(path, file)
      }
      this.session.select(files as Files)
      if (this.#disposed || identity !== this.#selection) return
      const state = this.session.snapshot()
      this.#binding = {creatorRevision: materialized.revision, selection: identity, session: state.session, revision: state.revision}
      this.#receive(state)
    } catch (error) {if (!this.#disposed && identity === this.#selection) this.#set({state: 'blocked', eligible: false, message: String(error)})}
  }
  continue(): ValidatedSnapshot {
    const binding = this.#binding
    const state = this.session.snapshot()
    if (!binding || !this.#status.eligible || !state.eligible || state.session !== binding.session || state.revision !== binding.revision || binding.selection !== this.#selection) throw new Error('The current draft has not completed valid validation')
    const result = this.session.continue()
    if (result.session !== binding.session || result.revision !== binding.revision) throw new Error('Validation snapshot no longer matches the current draft')
    return result
  }
  dispose() {if (this.#disposed) return; this.#disposed = true; this.#binding = undefined; this.#status = {state: 'blocked', eligible: false}; this.#unsubscribe(); this.session.dispose()}
}
