import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {test} from 'node:test'
import {startOwnedServer, stopOwnedServer} from './owned-server.js'

test('spawn failure rejects without leaving an owned process', async t => {
  await assert.rejects(startOwnedServer(t, '/nonexistent/account-test-node'), /could not start/)
})

test('cleanup escalates when an owned child ignores termination', async () => {
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000)"], {stdio:['ignore','ignore','ignore','ipc']})
  await once(child, 'message')
  try {
    await stopOwnedServer(child, 100)
    assert.equal(child.signalCode, 'SIGKILL')
  } finally {if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')}
})

test('cleanup reports a failed signal', async () => {
  const child = spawn(process.execPath, ['-e', "process.send('ready'); setInterval(() => {}, 1000)"], {stdio:['ignore','ignore','ignore','ipc']})
  await once(child, 'message')
  const kill = child.kill.bind(child)
  child.kill = () => false
  try {await assert.rejects(stopOwnedServer(child, 100), /Could not signal/)}
  finally {child.kill = kill; await stopOwnedServer(child)}
})

test('a failed signal result allows an already-exiting child to finish', async () => {
  const child = spawn(process.execPath, ['-e', "process.send('ready'); setInterval(() => {}, 1000)"], {stdio:['ignore','ignore','ignore','ipc']})
  await once(child, 'message')
  const kill = child.kill.bind(child)
  child.kill = signal => {kill(signal); return false}
  try {await stopOwnedServer(child, 1000); assert.ok(child.signalCode || child.exitCode !== null)}
  finally {child.kill = kill; if (child.exitCode === null && child.signalCode === null) await stopOwnedServer(child)}
})

test('a failed termination signal still forces the child to exit', async () => {
  const child = spawn(process.execPath, ['-e', "process.send('ready'); setInterval(() => {}, 1000)"], {stdio:['ignore','ignore','ignore','ipc']})
  await once(child, 'message')
  const kill = child.kill.bind(child)
  child.kill = signal => signal === 'SIGTERM' ? false : kill(signal)
  try {
    await assert.rejects(stopOwnedServer(child, 100), /Could not signal/)
    assert.equal(child.signalCode, 'SIGKILL')
  } finally {child.kill = kill; if (child.exitCode === null && child.signalCode === null) await stopOwnedServer(child)}
})

test('owned Astro fixture starts exactly one listener despite inherited autostart', async () => {
  const {mkdtemp, readFile, rm, writeFile} = await import('node:fs/promises')
  const {resolve} = await import('node:path')
  const {fileURLToPath} = await import('node:url')
  const {mkdir} = await import('node:fs/promises')
  const root = new URL('../../../../artifacts/work/', import.meta.url)
  await mkdir(root, {recursive:true})
  const directory = await mkdtemp(resolve(fileURLToPath(root), 'owned-server-listen-'))
  const preload = resolve(directory, 'record-listeners.cjs'), log = resolve(directory, 'listeners.log')
  await writeFile(preload, "const fs=require('node:fs'),net=require('node:net');const listen=net.Server.prototype.listen;net.Server.prototype.listen=function(...args){fs.appendFileSync(process.env.BIJUX_LISTENER_LOG,'listen\\n');return listen.apply(this,args)}\n")
  const previous = {node:process.env.NODE_OPTIONS, auto:process.env.ASTRO_NODE_AUTOSTART, log:process.env.BIJUX_LISTENER_LOG}
  let cleanup:(() => Promise<void>) | undefined
  try {
    process.env.NODE_OPTIONS = `--require=${JSON.stringify(preload)}`
    process.env.ASTRO_NODE_AUTOSTART = 'enabled'
    process.env.BIJUX_LISTENER_LOG = log
    const context = {after(callback:() => Promise<void>) {cleanup = callback}} as unknown as import('node:test').TestContext
    let pending:Promise<string>
    try {pending = startOwnedServer(context)} finally {
      for (const [key,value] of [['NODE_OPTIONS',previous.node],['ASTRO_NODE_AUTOSTART',previous.auto],['BIJUX_LISTENER_LOG',previous.log]] as const) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value
      }
    }
    const address = await pending
    assert.equal((await fetch(address)).status, 200)
    assert.deepEqual((await readFile(log, 'utf8')).trim().split('\n'), ['listen'])
    assert.ok(cleanup)
    await cleanup(); cleanup = undefined
    await assert.rejects(fetch(address, {signal:AbortSignal.timeout(5000)}), (error:unknown) =>
      error instanceof TypeError && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ECONNREFUSED')
  } finally {
    try {if (cleanup) await cleanup()} finally {await rm(directory,{recursive:true,force:true})}
  }
})

test('occupied fixed port does not report readiness or disturb its listener', async () => {
  const {createServer} = await import('node:net')
  const socket = createServer()
  await new Promise<void>((resolve, reject) => {socket.once('error', reject); socket.listen(0,'127.0.0.1',resolve)})
  const address = socket.address(); assert.ok(address && typeof address !== 'string')
  const child = spawn(process.execPath, ['--import', 'tsx', 'tests/account/owned-server-child.ts'], {
    cwd:new URL('../..', import.meta.url),
    env:{...process.env, ASTRO_NODE_AUTOSTART:'disabled', HOST:'127.0.0.1', PORT:String(address.port), BSS_MODE:'standalone', BIJUX_LOCAL_REFERENCE:'1', NODE_ENV:'development'},
    stdio:['ignore','ignore','ignore','ipc'],
  })
  let ready = false
  child.on('message', () => {ready = true})
  try {
    const [code] = await once(child, 'exit', {signal:AbortSignal.timeout(5000)})
    assert.notEqual(code, 0)
    assert.equal(ready, false)
    assert.equal(socket.listening, true)
  } finally {
    if (child.exitCode === null && child.signalCode === null) await stopOwnedServer(child)
    await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()))
  }
})
