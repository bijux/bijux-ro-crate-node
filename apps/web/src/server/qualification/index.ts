import {createHash} from 'node:crypto'
import {Worker} from 'node:worker_threads'
import type {ValidationResult} from '@bijux/ro-crate-validator'

export const localPolicy = 'local-reference/default-validation' as const
export interface SavedVersion {versionId: string; contentHash: string}
export interface FrozenSelection {version: SavedVersion; files: ReadonlyMap<string, Uint8Array>}
export type Qualification = {policy: typeof localPolicy; version: SavedVersion; digest: string} & (
  | {status: 'valid' | 'invalid'; result: ValidationResult}
  | {status: 'incomplete'; reason: string; result?: ValidationResult})
export interface Limits {worker: URL; concurrency: number; queue: number; maxBytes: number; deadlineMs: number}
type Job = {input: FrozenSelection; digest: string; resolve: (result: Qualification) => void; signal?: AbortSignal; cancel?: () => void}

/** Digest length-framed paths and their exact bytes in a stable order. */
export function digestFrozenFiles(files: ReadonlyMap<string, Uint8Array>): string {
  let bytes = 0
  for (const [path, data] of files) {
    bytes += Buffer.byteLength(path) + data.byteLength
    if (bytes > 16 * 1024 * 1024) throw new Error('Input limit exceeded')
  }
  const hash = createHash('sha256')
  for (const [path, data] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const prefix = Buffer.alloc(8)
    prefix.writeUInt32BE(Buffer.byteLength(path), 0)
    prefix.writeUInt32BE(data.byteLength, 4)
    hash.update(prefix).update(path).update(data)
  }
  return hash.digest('hex')
}

/** Only a matching immutable saved version and a complete valid result can be used. */
export function matchesSavedVersion(result: Qualification, version: SavedVersion, digest: string): boolean {
  return result.status === 'valid' && result.version.versionId === version.versionId &&
    result.version.contentHash === version.contentHash && result.digest === digest
}

export class QualificationPool {
  private readonly pending: Job[] = []
  private readonly active = new Set<() => void>()
  private closed = false
  constructor(private readonly limits: Limits) {
    for (const [key, value] of Object.entries({concurrency: limits.concurrency, queue: limits.queue, maxBytes: limits.maxBytes, deadlineMs: limits.deadlineMs}))
      if (!Number.isSafeInteger(value) || value < (key === 'queue' ? 0 : 1) || (key === 'deadlineMs' && value > 300000) || (key === 'maxBytes' && value > 16 * 1024 * 1024) || (key === 'concurrency' && value > 4) || (key === 'queue' && value > 32)) throw new Error('Invalid qualification limit: ' + key)
  }
  qualify(selection: FrozenSelection, signal?: AbortSignal): Promise<Qualification> {
    const version = {...selection.version}
    const rejected = (reason: string): Promise<Qualification> => Promise.resolve({policy: localPolicy, version, digest: '', status: 'incomplete', reason})
    if (!version.versionId || !version.contentHash) return rejected('missing saved version identity')
    if (this.closed || signal?.aborted) return rejected('cancelled')
    if (this.active.size >= this.limits.concurrency && this.pending.length >= this.limits.queue) return rejected('queue full')
    const files = new Map<string, Uint8Array>()
    let bytes = 0
    for (const [path, data] of selection.files) {
      bytes += Buffer.byteLength(path) + data.byteLength
      if (bytes > this.limits.maxBytes) return rejected('input limit exceeded')
      const copy = Uint8Array.from(data)
      files.set(path, copy)
    }
    const digest = digestFrozenFiles(files)
    const input = {version, files}
    return new Promise(resolve => {
      const job: Job = {input, digest, resolve, signal}
      if (this.closed || signal?.aborted) return this.finish(job, 'cancelled')
      if (this.active.size >= this.limits.concurrency && this.pending.length >= this.limits.queue) return this.finish(job, 'queue full')
      job.cancel = () => {
        const index = this.pending.indexOf(job)
        if (index >= 0) {this.pending.splice(index, 1); this.finish(job, 'cancelled')}
      }
      signal?.addEventListener('abort', job.cancel, {once: true})
      this.pending.push(job)
      this.pump()
    })
  }
  close(): void {
    this.closed = true
    for (const job of this.pending.splice(0)) this.finish(job, 'cancelled')
    for (const stop of this.active) stop()
  }
  private finish(job: Job, reason: string): void {
    if (job.cancel) job.signal?.removeEventListener('abort', job.cancel)
    job.resolve({policy: localPolicy, version: job.input.version, digest: job.digest, status: 'incomplete', reason})
  }
  private pump(): void {
    while (!this.closed && this.active.size < this.limits.concurrency && this.pending.length) this.start(this.pending.shift()!)
  }
  private start(job: Job): void {
    if (job.cancel) job.signal?.removeEventListener('abort', job.cancel)
    let worker: Worker
    try {worker = new Worker(this.limits.worker, {execArgv: []})} catch {this.finish(job, 'worker unavailable'); this.pump(); return}
    let settled = false
    const end = (result?: ValidationResult, reason = 'worker failed') => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      job.signal?.removeEventListener('abort', stop)
      const complete = () => {
        this.active.delete(stop)
        if (this.closed || job.signal?.aborted) {this.finish(job, 'cancelled'); this.pump(); return}
        const issues = result?.report?.issues
        if (result && (result.status === 'valid' || result.status === 'invalid' || result.status === 'incomplete') &&
            issues && ['ERROR', 'CRITICAL', 'WARNING', 'INFO'].every(key => Array.isArray(issues[key as keyof typeof issues])) &&
            (result.status !== 'incomplete' || typeof result.reason === 'string')) {
          const binding = {policy: localPolicy, version: job.input.version, digest: job.digest}
          if (result.status === 'incomplete') job.resolve({...binding, status: 'incomplete', reason: result.reason, result})
          else job.resolve({...binding, status: result.status, result})
        } else this.finish(job, reason)
        this.pump()
      }
      void worker.terminate().then(complete, complete)
    }
    const stop = () => end(undefined, 'cancelled')
    this.active.add(stop)
    job.signal?.addEventListener('abort', stop, {once: true})
    const timer = setTimeout(() => end(undefined, 'deadline exceeded'), this.limits.deadlineMs)
    worker.once('message', (message: ValidationResult) => end(message))
    worker.once('error', () => end())
    worker.once('exit', () => end())
    try {worker.postMessage(job.input.files)} catch {end()}
  }
}
