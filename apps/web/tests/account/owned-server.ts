import {spawn, type ChildProcess} from 'node:child_process'
import type {TestContext} from 'node:test'

const alive = (child:ChildProcess) => child.exitCode === null && child.signalCode === null

function signalAndWait(child:ChildProcess, signal:NodeJS.Signals, ms:number):Promise<boolean> {
  if (!alive(child)) return Promise.resolve(true)
  return new Promise((resolve, reject) => {
    const cleanup = () => {clearTimeout(timer); child.off('exit', exited); child.off('error', failed)}
    const exited = () => {cleanup(); resolve(true)}
    let signalFailed = false
    const failed = () => {if (!alive(child)) {cleanup(); resolve(true)} else signalFailed = true}
    const timer = setTimeout(() => {cleanup(); if (signalFailed) reject(Error('Could not signal account test server')); else resolve(false)}, ms)
    child.once('exit', exited); child.once('error', failed)
    try {if (!child.kill(signal)) failed()} catch {failed()}
  })
}

export async function stopOwnedServer(child:ChildProcess, timeout = 2000):Promise<void> {
  if (!child.pid || !alive(child)) return
  let terminationFailure:unknown
  try {if (await signalAndWait(child, 'SIGTERM', timeout)) return}
  catch (error) {terminationFailure = error}
  try {
    if (!await signalAndWait(child, 'SIGKILL', timeout)) throw Error('Account test server did not exit')
  } catch (error) {
    if (terminationFailure !== undefined) throw new AggregateError([terminationFailure, error], 'Could not signal account test server or confirm forced termination')
    throw error
  }
  if (terminationFailure !== undefined) throw terminationFailure
}

export async function startOwnedServer(t:TestContext, executable = process.execPath):Promise<string> {
  const child = spawn(executable, ['--import', 'tsx', 'tests/account/owned-server-child.ts'], {
    cwd:new URL('../..', import.meta.url), env:{...process.env, HOST:'127.0.0.1', PORT:'0', BSS_MODE:'standalone', BIJUX_LOCAL_REFERENCE:'1', NODE_ENV:'development'}, stdio:['ignore','ignore','ignore','ipc'],
  })
  t.after(() => stopOwnedServer(child))
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => finish(Error('Account test server readiness timed out')), 10000)
    const finish = (error?:Error, port?:number) => {clearTimeout(timer); child.off('message', message); child.off('error', failed); child.off('exit', exited); error ? reject(error) : resolve(port!)}
    const message = (value:unknown) => {const port = (value as {port?:unknown})?.port; if (typeof port === 'number' && Number.isInteger(port) && port > 0 && port <= 65535) finish(undefined,port)}
    const failed = () => finish(Error('Account test server could not start'))
    const exited = () => finish(Error('Account test server exited before readiness'))
    child.on('message', message); child.once('error', failed); child.once('exit', exited)
  })
  return `http://127.0.0.1:${port}`
}
