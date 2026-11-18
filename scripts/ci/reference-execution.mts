import assert from 'node:assert/strict'
import {spawn, type ChildProcess, type SpawnOptions} from 'node:child_process'
import {closeSync, openSync} from 'node:fs'
import {resolve} from 'node:path'

interface ReferenceStep {command: string, args?: string[], stdin?: string, stdout?: string, env?: NodeJS.ProcessEnv}
type UnredirectedReferenceStep = ReferenceStep & {stdin?: '' | undefined, stdout?: '' | undefined}
interface ReferenceFamily<T> {name: string, steps: T[]}
interface ReferencePartitionOptions<T> {partitions: number, workers?: number, timeout?: number, run: (index: number, signal: AbortSignal) => T | PromiseLike<T>}

/** Own verifier descendants as well as the direct Python capture process. */
export function terminateReferenceCapture(child: ChildProcess) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {stdio: 'ignore'})
    killer.once('error', error => child.emit('error', error))
  } else {
    try {process.kill(-child.pid, 'SIGKILL')}
    catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ESRCH') queueMicrotask(() => child.emit('error', error))}
  }
}

export function spawnReferenceCapture(command: string, args: readonly string[], {signal, ...options}: Omit<SpawnOptions, 'signal'> & {signal?: AbortSignal}) {
  const child = spawn(command, args, {...options, detached: process.platform !== 'win32'})
  const stop = () => terminateReferenceCapture(child)
  if (signal?.aborted) stop()
  else signal?.addEventListener('abort', stop, {once: true})
  child.once('close', () => signal?.removeEventListener('abort', stop))
  return child
}

export function runReferenceStep(step: ReferenceStep, options: {cwd: string, timeout?: number}): Promise<{seconds: number, status: number}>
export function runReferenceStep(step: UnredirectedReferenceStep, options?: {cwd?: string | URL, timeout?: number}): Promise<{seconds: number, status: number}>
/** Keep each capture's file descriptors owned until its child has closed. */
export async function runReferenceStep(step: ReferenceStep, {cwd, timeout = 240000}: {cwd?: string | URL, timeout?: number} = {}) {
  assert.ok(Number.isFinite(timeout) && timeout > 0 && timeout <= 240000, 'Reference timeout must remain bounded')
  const descriptors: number[] = [], started = Date.now()
  try {
    const input = step.stdin ? openSync(resolve(cwd as string, step.stdin), 'r') : 'inherit'
    if (typeof input === 'number') descriptors.push(input)
    const output = step.stdout ? openSync(resolve(cwd as string, step.stdout), 'w') : 'inherit'
    if (typeof output === 'number') descriptors.push(output)
    await new Promise<void>((accept, reject) => {
      const child = spawn(step.command, step.args as string[], {cwd, stdio: [input, output, 'inherit'],
        env: {...process.env, ...step.env, PYTHONDONTWRITEBYTECODE: '1'}})
      const timer = setTimeout(() => child.kill('SIGKILL'), timeout)
      let error: Error | undefined
      child.once('error', value => {error = value})
      child.once('close', (status, signal) => {
        clearTimeout(timer)
        if (error) reject(error)
        else if (status !== 0) reject(new Error(`Reference command failed (${signal ?? status}): ${step.command}`))
        else accept()
      })
    })
    return {seconds: (Date.now() - started) / 1000, status: 0}
  } finally {for (const descriptor of descriptors) closeSync(descriptor)}
}

/** Bound independent families to two chains; validation follows their barrier. */
export async function runReferenceFamilies<T, U>(families: ReferenceFamily<T>[], final: U, execute: (step: T | U) => unknown) {
  assert.ok(families.length && families.every(family => family.steps.length), 'Reference families must not be empty')
  assert.equal(new Set(families.map(family => family.name)).size, families.length, 'Reference family names must be unique')
  let next = 0
  const failures: unknown[] = []
  const worker = async () => {
    while (next < families.length && !failures.length) {
      const family = families[next++]
      try {for (const step of family.steps) await execute(step)}
      catch (error) {failures.push(error)}
    }
  }
  await Promise.all([worker(), worker()])
  if (failures.length) throw new AggregateError(failures, 'Reference family qualification failed')
  await execute(final)
}

/** Bound independent captures and drain owned work before the caller's timeout. */
export async function executeReferencePartitions<T>({partitions, workers = 2, timeout = 220000, run}: ReferencePartitionOptions<T>) {
  assert.ok(partitions === 2 || partitions === 4, 'Reference partitions must be 2 or 4')
  assert.ok((workers === 2 || workers === 4) && workers <= partitions, 'Reference workers must fit their partitions')
  assert.ok(Number.isFinite(timeout) && timeout > 0 && timeout <= 220000, 'Reference deadline must remain below the caller timeout')
  const values: T[] = new Array(partitions), failures: unknown[] = [], controller = new AbortController()
  let next = 0
  const deadline = setTimeout(() => {
    failures.push(new Error('Reference capture exceeded its ' + timeout + ' ms deadline'))
    controller.abort()
  }, timeout)
  try {
    await Promise.all(Array.from({length: workers}, async () => {
      while (next < partitions && !failures.length) {
        const index = next++
        try {values[index] = await run(index, controller.signal)}
        catch (error) {failures.push(error); controller.abort()}
      }
    }))
  } finally {clearTimeout(deadline)}
  if (failures.length) throw new AggregateError(failures, 'Reference partitions failed')
  return values
}
