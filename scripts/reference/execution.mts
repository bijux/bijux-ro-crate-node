import assert from 'node:assert/strict'
import {execFileSync, spawn, type ChildProcess, type SpawnOptions} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {closeSync, openSync} from 'node:fs'
import {resolve} from 'node:path'

interface ReferenceStep {command: string, args?: string[], stdin?: string, stdout?: string, env?: NodeJS.ProcessEnv, managed?: 'original-collections'}
type UnredirectedReferenceStep = ReferenceStep & {stdin?: '' | undefined, stdout?: '' | undefined}
interface ReferenceFamily<T> {name: string, steps: T[]}
interface ReferencePartitionOptions<T> {partitions: number, workers?: number, timeout?: number, onFailure?: () => void, run: (index: number, signal: AbortSignal) => T | PromiseLike<T>}

const stoppingCaptures = new WeakSet<ChildProcess>()

/** Stop only a capture whose detached group is still owned by its leader. */
export function terminateReferenceCapture(child: ChildProcess) {
  if (!child.pid || stoppingCaptures.has(child)) return
  stoppingCaptures.add(child)
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {stdio: 'ignore'})
    killer.once('error', error => child.emit('error', error))
  } else if (child.connected) {
    child.send({signal: 'SIGKILL'}, error => {if (error) child.emit('error', error)})
  } else {
    queueMicrotask(() => child.emit('error', new Error('Reference capture cleanup could not be confirmed: owner disconnected')))
  }
}

export function spawnReferenceCapture(command: string, args: readonly string[], {signal, inheritedGroup = false, ...options}: Omit<SpawnOptions, 'signal'> & {signal?: AbortSignal, inheritedGroup?: boolean}) {
  if (inheritedGroup || process.platform === 'win32') {
    const child = spawn(command, args, {...options, detached: false})
    const stop = () => inheritedGroup ? child.kill('SIGTERM') : terminateReferenceCapture(child)
    if (signal?.aborted) stop()
    else signal?.addEventListener('abort', stop, {once: true})
    child.once('close', () => signal?.removeEventListener('abort', stop))
    return child
  }
  assert.ok(options.stdio === undefined, 'Standalone reference captures require owned standard streams')
  const identity = randomUUID()
  const child = spawn(process.execPath, [fileURLToPath(new URL('./process-owner.mjs', import.meta.url)), identity],
    {...options, stdio: ['pipe', 'pipe', 'pipe', 'ipc'], detached: true})
  let finished = false, monitoring = false, releasing = false
  const stop = () => {if (!finished) terminateReferenceCapture(child)}
  child.on('message', value => {
    const result = value as {status?: number | null, signal?: NodeJS.Signals | null, error?: {message: string, code?: string}}
    if (result.error) {
      child.emit('error', Object.assign(new Error(result.error.message), {code: result.error.code})); stop(); return
    }
    if (!('status' in result) || monitoring) return
    monitoring = true
    void (async () => {
      let graceDeadline = 0
      while (!finished && child.connected && child.pid) {
        const members = groupMembers(child.pid)
        if (!members.some(member => member.pid === child.pid && member.command.includes(identity)))
          throw new Error('Reference capture cleanup could not be confirmed: owner disappeared')
        if (!members.some(member => member.pid !== child.pid)) {releasing = true; child.send({release: true}); return}
        if (result.status !== 0 && !graceDeadline) {child.send({signal: 'SIGTERM'}); graceDeadline = Date.now() + 500}
        if (graceDeadline && Date.now() >= graceDeadline) {stop(); return}
        await new Promise(resolve => setTimeout(resolve, 25))
      }
    })().catch(error => {child.emit('error', error); if (child.connected) child.disconnect()})
  })
  child.once('exit', () => {
    if (!releasing && !stoppingCaptures.has(child))
      child.emit('error', new Error('Reference capture cleanup could not be confirmed: owner exited'))
    if (!releasing) {child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy()}
  })
  child.send({command, args: [...args]})
  if (signal?.aborted) stop()
  else signal?.addEventListener('abort', stop, {once: true})
  child.once('close', () => {finished = true; signal?.removeEventListener('abort', stop)})
  return child
}

/** After an independently owned capture closes, confirm its group has stopped. */
export async function confirmReferenceCaptureCleanup(child: ChildProcess, inheritedGroup = false) {
  if (inheritedGroup || process.platform === 'win32' || !child.pid) return
  const deadline = Date.now() + 2000
  while (groupMembers(child.pid).length) {
    if (Date.now() >= deadline) throw new Error('Reference capture cleanup could not be confirmed')
    await new Promise(resolve => setTimeout(resolve, 25))
  }
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
    if (process.platform !== 'win32') await runOwnedReference(step, {cwd, input, output, timeout})
    else await new Promise<void>((accept, reject) => {
      const child = spawn(step.command, step.args as string[], {cwd, stdio: [input, output, 'inherit'],
        env: {...process.env, ...step.env, PYTHONDONTWRITEBYTECODE: '1'}})
      let expired = false, escalation: ReturnType<typeof setTimeout> | undefined
      const timer = setTimeout(() => {
        expired = true
        child.kill('SIGTERM')
        escalation = setTimeout(() => child.kill('SIGKILL'), 500)
      }, timeout)
      let error: Error | undefined
      child.once('error', value => {error = value})
      child.once('close', (status, signal) => {
        clearTimeout(timer); clearTimeout(escalation)
        if (expired) reject(new Error(`Reference command exceeded its ${timeout} ms deadline: ${step.command}`))
        else if (error) reject(error)
        else if (status !== 0) reject(new Error(`Reference command failed (${signal ?? status}): ${step.command}`))
        else accept()
      })
    })
    return {seconds: (Date.now() - started) / 1000, status: 0}
  } finally {for (const descriptor of descriptors) closeSync(descriptor)}
}

interface GroupMember {pid: number, group: number, state: string, command: string}
function groupMembers(group: number): GroupMember[] {
  return execFileSync('ps', ['-axo', 'pid=,pgid=,stat=,command='], {encoding: 'utf8'}).trim().split('\n').map(line => {
    const [pid, group, state, ...command] = line.trim().split(/\s+/)
    return {pid: Number(pid), group: Number(group), state, command: command.join(' ')}
  }).filter(member => member.group === group && !member.state.startsWith('Z'))
}

async function runOwnedReference(step: ReferenceStep, {cwd, input, output, timeout}: {
  cwd?: string | URL, input: number | 'inherit', output: number | 'inherit', timeout: number
}) {
  const identity = randomUUID()
  const child = spawn(process.execPath, [fileURLToPath(new URL('./process-owner.mjs', import.meta.url)), identity], {
    cwd, stdio: [input, output, 'inherit', 'ipc'], detached: true,
    env: {...process.env, ...step.env, PYTHONDONTWRITEBYTECODE: '1'},
  })
  const pid = child.pid
  let result: {status?: number | null, signal?: NodeJS.Signals | null, error?: {message: string, code?: string}, cancel?: boolean} | undefined
  let launchError: Error | undefined, closed = false, requestedCancellation = false
  const channel: {error?: Error} = {}
  child.once('error', error => {launchError = error})
  child.once('close', () => {closed = true})
  child.on('message', message => {
    const event = message as NonNullable<typeof result>
    if (event.cancel) requestedCancellation = true
    else result = event
  })
  const send = (message: object) => {
    if (!child.connected) {channel.error = new Error('owner disconnected'); return}
    child.send(message, error => {if (error) channel.error = error})
  }
  send({command: step.command, args: step.args, managed: step.managed})
  const deadline = Date.now() + timeout
  let failure: Error | undefined, graceDeadline = 0, killed = false, cleanupDeadline = 0
  const pause = () => new Promise(resolve => setTimeout(resolve, 25))
  while (true) {
    if (launchError) throw launchError
    if (channel.error) {
      if (child.connected) child.disconnect()
      throw new Error('Reference group cleanup could not be confirmed: ' + channel.error.message)
    }
    if (!pid) throw new Error('Reference group owner did not start')
    let members: GroupMember[]
    try {members = groupMembers(pid)} catch {
      if (child.connected) child.disconnect()
      throw new Error('Reference group cleanup could not be observed')
    }
    const anchor = members.some(member => member.pid === pid && member.command.includes(identity))
    const others = members.some(member => member.pid !== pid)
    if (!failure && Date.now() >= deadline) failure = new Error(`Reference command exceeded its ${timeout} ms deadline: ${step.command}`)
    if (!failure && requestedCancellation) failure = new Error('Managed reference capture failed')
    if (!failure && result?.error) {failure = Object.assign(new Error(result.error.message), {code: result.error.code})}
    if (!failure && result && result.status !== 0) failure = new Error(`Reference command failed (${result.signal ?? result.status}): ${step.command}`)
    if (!anchor) {
      if (closed && !others) {if (failure) throw failure; throw new Error('Reference group owner exited unexpectedly')}
      if (!cleanupDeadline) cleanupDeadline = Date.now() + 2000
      if (Date.now() >= cleanupDeadline) throw new Error('Reference group cleanup could not be confirmed')
      await pause(); continue
    }
    if (failure && !graceDeadline) {
      send({signal: 'SIGTERM'}); graceDeadline = Date.now() + 500
    }
    if (failure && others && !killed && Date.now() >= graceDeadline) {
      send({signal: 'SIGKILL'}); killed = true; cleanupDeadline = Date.now() + 2000
    }
    if ((result || failure) && !others) {
      send({release: true})
      while (!closed && Date.now() < deadline + 2500) await pause()
      if (!closed) throw new Error('Reference group owner did not exit')
      if (failure) throw failure
      return
    }
    if (killed && Date.now() >= cleanupDeadline) throw new Error('Reference group cleanup could not be confirmed')
    await pause()
  }
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
export async function executeReferencePartitions<T>({partitions, workers = 2, timeout = 220000, onFailure, run}: ReferencePartitionOptions<T>) {
  assert.ok(partitions === 2 || partitions === 4, 'Reference partitions must be 2 or 4')
  assert.ok((workers === 2 || workers === 4) && workers <= partitions, 'Reference workers must fit their partitions')
  assert.ok(Number.isFinite(timeout) && timeout > 0 && timeout <= 220000, 'Reference deadline must remain below the caller timeout')
  const values: T[] = new Array(partitions), failures: unknown[] = [], controller = new AbortController()
  let next = 0
  const deadline = setTimeout(() => {
    failures.push(new Error('Reference capture exceeded its ' + timeout + ' ms deadline'))
    onFailure?.(); controller.abort()
  }, timeout)
  try {
    await Promise.all(Array.from({length: workers}, async () => {
      while (next < partitions && !failures.length) {
        const index = next++
        try {values[index] = await run(index, controller.signal)}
        catch (error) {failures.push(error); onFailure?.(); controller.abort()}
      }
    }))
  } finally {clearTimeout(deadline)}
  if (failures.length) throw new AggregateError(failures, 'Reference partitions failed')
  return values
}
