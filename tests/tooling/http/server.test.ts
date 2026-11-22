import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createInterface} from 'node:readline'
import {test} from 'node:test'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {serve} from '../../../scripts/http/server.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))

test('example server serves owned files with content types and rejects invalid paths', async t => {
  const owner = resolve(root, 'artifacts/work')
  await mkdir(owner, {recursive: true})
  const directory = await mkdtemp(resolve(owner, 'example-http-'))
  t.after(() => rm(directory, {recursive: true, force: true}))
  await writeFile(resolve(directory, 'example.json'), '{"ok":true}')
  await writeFile(resolve(directory, 'plain.txt'), 'text')
  const server = await serve(directory)
  t.after(() => server.close())
  const json = await fetch(server.origin + '/example.json')
  assert.equal(json.status, 200)
  assert.equal(json.headers.get('content-type'), 'application/json')
  assert.equal(await json.text(), '{"ok":true}')
  const plain = await fetch(server.origin + '/plain.txt')
  assert.equal(plain.headers.get('content-type'), 'application/octet-stream')
  assert.equal(await plain.text(), 'text')
  assert.equal((await fetch(server.origin + '/missing')).status, 404)
  assert.equal((await fetch(server.origin + '/%2e%2e%2fescape')).status, 403)
  assert.equal((await fetch(server.origin + '/%')).status, 404)
})

test('direct example readiness guarantees clean signal handling', {timeout: 10000}, async t => {
  await Promise.all(Array.from({length: 12}, async (_, index) => {
    const child = spawn(process.execPath, [resolve(root, 'scripts/http/example.mjs')], {cwd: root})
    t.after(() => {if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')})
    const [message] = await once(child.stdout, 'data') as [Buffer]
    assert.match(message.toString(), /^Submission example: http:\/\/127\.0\.0\.1:\d+\/examples\/submission\/index\.html/)
    const exit = once(child, 'exit')
    child.kill(index % 2 ? 'SIGINT' : 'SIGTERM')
    const [code, signal] = await exit
    assert.equal(code, 0)
    assert.equal(signal, null)
  }))
})

test('example registers both signal handlers before announcing readiness', {timeout: 10000}, async t => {
  const owner = resolve(root, 'artifacts/work')
  await mkdir(owner, {recursive: true})
  const directory = await mkdtemp(resolve(owner, 'example-signals-'))
  t.after(() => rm(directory, {recursive: true, force: true}))
  const hook = resolve(directory, 'signals.mjs')
  await writeFile(hook, `
const installed = new Set()
const originalOnce = process.once
process.once = function (name, ...args) {
  if (name === 'SIGINT' || name === 'SIGTERM') installed.add(name)
  return Reflect.apply(originalOnce, this, [name, ...args])
}
const originalLog = console.log
console.log = function (...args) {
  if (String(args[0]).startsWith('Submission example: ')) process.stdout.write('signals=' + [...installed].sort().join(',') + '\\n')
  return Reflect.apply(originalLog, this, args)
}
`)
  const child = spawn(process.execPath, ['--import', pathToFileURL(hook).href, resolve(root, 'scripts/http/example.mjs')], {cwd: root})
  t.after(() => {if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')})
  const lines = createInterface({input: child.stdout})
  t.after(() => lines.close())
  const [receipt] = await once(lines, 'line') as [string]
  assert.equal(receipt, 'signals=SIGINT,SIGTERM')
  const exit = once(child, 'exit')
  child.kill('SIGTERM')
  assert.deepEqual(await exit, [0, null])
})
