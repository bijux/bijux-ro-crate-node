import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'
import {serve} from '../../scripts/http/server.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))

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

test('direct example command reports its address and exits on SIGTERM', {timeout: 10000}, async t => {
  const child = spawn(process.execPath, [resolve(root, 'scripts/http/example.mjs')], {cwd: root})
  t.after(() => {if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')})
  const [message] = await once(child.stdout, 'data') as [Buffer]
  assert.match(message.toString(), /^Submission example: http:\/\/127\.0\.0\.1:\d+\/examples\/submission\/index\.html/)
  const exit = once(child, 'exit')
  child.kill('SIGTERM')
  const [code, signal] = await exit
  assert.equal(code, 0)
  assert.equal(signal, null)
})
