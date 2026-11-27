import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {test} from 'node:test'
import {startOwnedServer, stopOwnedServer} from '../support/owned-server.js'
import {closeAll} from '../support/cleanup.js'

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

test('cleanup attempts each resource and reports all failures', async () => {
  const visited:string[] = [], first=Error('browser'), second=Error('receiver')
  await assert.rejects(closeAll([
    () => {visited.push('browser'); throw first},
    () => {visited.push('server')},
    () => {visited.push('receiver'); throw second},
    () => {visited.push('pool')},
  ]), (error:unknown) => error instanceof AggregateError && error.errors[0] === first && error.errors[1] === second)
  assert.deepEqual(visited, ['browser','server','receiver','pool'])
})
