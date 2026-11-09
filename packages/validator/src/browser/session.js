import {snapshotFiles, reportOf} from '@bijux/ro-crate-core'
import {isValidationResponse} from '../worker/messages.js'

const MAX_TIMER_DELAY = 2147483647

function failureReason(value) {
  try {
    const message = value?.message
    if (typeof message === 'string' && message.trim()) return message
  } catch {}
  try {
    const text = String(value)
    if (text.trim()) return text
  } catch {}
  return 'Validation failed'
}

export class Session {
  #files
  #options
  #session = crypto.randomUUID()
  #revision = 0
  #job = 0
  #worker
  #timer
  #deadline
  #result
  #approved
  #state = 'idle'
  #listeners = new Set()
  #disposed = false
  #factory
  #debounce
  #timeout

  constructor({workerFactory, debounceMs = 250, timeoutMs = 60000, options = {}}) {
    if (typeof workerFactory !== 'function') throw new TypeError('A worker factory is required')
    if (!Number.isFinite(debounceMs) || debounceMs < 0 || debounceMs > MAX_TIMER_DELAY ||
        !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMER_DELAY)
      throw new TypeError('Expected finite debounce and timeout budgets within 2147483647 ms')
    this.#factory = workerFactory
    this.#debounce = debounceMs
    this.#timeout = timeoutMs
    this.#options = structuredClone(options)
  }

  snapshot() {
    return Object.freeze({session: this.#session, revision: this.#revision, state: this.#state,
      eligible: !this.#disposed && this.#state === 'valid' && this.#approved?.revision === this.#revision,
      result: this.#result ? structuredClone(this.#result) : undefined})
  }

  subscribe(listener) {
    this.#assertLive()
    this.#listeners.add(listener)
    listener(this.snapshot())
    return () => this.#listeners.delete(listener)
  }

  select(files, options = this.#options) {
    const revision = this.#invalidate()
    if (!this.#ownsRevision(revision)) return
    this.#session = crypto.randomUUID()
    this.#files = undefined
    try {
      const selected = snapshotFiles(files), selectedOptions = structuredClone(options)
      if (!this.#ownsRevision(revision)) return
      this.#files = selected
      this.#options = selectedOptions
      this.#schedule()
    } catch (error) {if (this.#ownsRevision(revision)) this.#fail(error)}
  }

  edit(path, value) {
    const revision = this.#invalidate()
    if (!this.#ownsRevision(revision)) return
    try {
      if (!this.#files?.has(path)) throw new Error('Edit requires a selected crate file: ' + path)
      if (typeof value !== 'string') throw new TypeError('Draft edits must be text')
      this.#files = new Map(this.#files).set(path, value)
      this.#schedule()
    } catch (error) {if (this.#ownsRevision(revision)) this.#fail(error)}
  }

  updateOptions(options) {
    const revision = this.#invalidate()
    if (!this.#ownsRevision(revision)) return
    try {
      const selected = structuredClone(options)
      if (!this.#ownsRevision(revision)) return
      this.#options = selected
      this.#schedule()
    } catch (error) {if (this.#ownsRevision(revision)) this.#fail(error)}
  }

  revalidate() {const revision = this.#invalidate(); if (this.#ownsRevision(revision)) this.#start()}

  cancel() {
    const revision = this.#invalidate()
    if (this.#ownsRevision(revision)) this.#fail('Validation canceled. Edit or validate again to continue.')
  }

  continue() {
    this.#assertLive()
    if (!this.snapshot().eligible || !this.#approved || this.#result?.status !== 'valid')
      throw new Error('The current revision has not completed valid validation')
    return {session: this.#session, revision: this.#revision,
      files: snapshotFiles(this.#approved.files), options: structuredClone(this.#approved.options),
      result: structuredClone(this.#result)}
  }

  dispose() {
    if (this.#disposed) return
    this.#disposed = true
    this.#files = this.#approved = this.#result = undefined
    this.#listeners.clear()
    this.#stop()
  }

  #assertLive() {if (this.#disposed) throw new Error('Validation session is disposed')}
  #ownsRevision(revision) {return !this.#disposed && this.#revision === revision}

  #stop() {
    clearTimeout(this.#timer)
    clearTimeout(this.#deadline)
    const worker = this.#worker
    // Release ownership before termination callbacks can reenter.
    this.#worker = this.#timer = this.#deadline = undefined
    if (worker) {
      worker.onmessage = worker.onerror = worker.onmessageerror = null
      worker.terminate()
    }
  }

  #emit() {for (const listener of this.#listeners) listener(this.snapshot())}

  #invalidate() {
    this.#assertLive()
    const revision = ++this.#revision
    this.#approved = this.#result = undefined
    this.#state = 'editing'
    this.#stop()
    return revision
  }

  #schedule() {
    const revision = this.#revision, session = this.#session
    // Subscribers observe a complete selection/overlay/options transition.
    // Reentrant edits, validation or disposal supersede this scheduling request.
    this.#emit()
    if (this.#disposed || this.#revision !== revision || this.#session !== session || this.#state !== 'editing') return
    this.#timer = setTimeout(() => this.#start(), this.#debounce)
  }

  #fail(value) {
    const revision = this.#revision
    this.#stop()
    if (!this.#ownsRevision(revision)) return
    const reason = failureReason(value)
    if (!this.#ownsRevision(revision)) return
    this.#approved = undefined
    this.#result = {status: 'incomplete', stage: 'input', reason, report: reportOf([])}
    this.#state = 'incomplete'
    this.#emit()
  }

  #start() {
    if (this.#disposed) return
    if (!this.#files) return this.#fail('Select local crate files first')
    const revision = this.#revision, session = this.#session
    let request, worker
    const ownsRevision = () => this.#ownsRevision(revision) && this.#session === session
    const current = () => ownsRevision() && this.#worker === worker
    try {
      request = {session, revision, id: ++this.#job,
        files: snapshotFiles(this.#files), options: structuredClone(this.#options)}
      worker = this.#factory()
      // A factory may synchronously replace or dispose the selection. Its
      // returned worker belongs only to this request, never to the newer one.
      if (!ownsRevision()) {worker.terminate(); return}
      this.#worker = worker
      this.#state = 'validating'
      this.#emit()
      if (!current()) {if (this.#worker === worker) this.#stop(); return}
      worker.onmessage = ({data}) => {
        if (!current() || data?.session !== request.session ||
            data?.revision !== request.revision || data?.id !== request.id) return
        if (!isValidationResponse(data)) return this.#fail('The validation worker returned a malformed result')
        let result
        try {result = structuredClone(data.result)}
        catch (error) {if (current()) this.#fail(error); return}
        if (!current()) return
        this.#stop()
        if (!ownsRevision()) return
        this.#result = result
        this.#approved = result.status === 'valid' ? request : undefined
        this.#state = result.status
        this.#emit()
      }
      worker.onerror = event => {event.preventDefault?.(); if (current()) this.#fail(event.message || 'Validation worker failed')}
      worker.onmessageerror = () => {if (current()) this.#fail('The validation worker returned unreadable data')}
      this.#deadline = setTimeout(() => {if (current()) this.#fail('Validation exceeded its execution budget')}, this.#timeout)
      worker.postMessage(request)
    } catch (error) {if (ownsRevision()) this.#fail(error)}
  }
}
