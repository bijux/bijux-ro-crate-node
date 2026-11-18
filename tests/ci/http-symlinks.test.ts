import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import test from 'node:test'
import {fileURLToPath, pathToFileURL} from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))

test('example server follows internal symlinks but refuses links outside its root', {timeout: 10000}, async t => {
  const owner = resolve(root, 'artifacts/work')
  await mkdir(owner, {recursive: true})
  const directory = await mkdtemp(resolve(owner, 'http-symlinks-'))
  t.after(() => rm(directory, {recursive: true, force: true}))
  const base = resolve(directory, 'public'), outside = resolve(directory, 'outside')
  await mkdir(resolve(base, 'nested'), {recursive: true})
  await mkdir(outside)
  await writeFile(resolve(base, 'nested/inside.txt'), 'inside')
  await writeFile(resolve(outside, 'secret.txt'), 'outside')
  await symlink('nested/inside.txt', resolve(base, 'internal-file.txt'))
  await symlink('nested', resolve(base, 'internal-directory'))
  await symlink(resolve(outside, 'secret.txt'), resolve(base, 'external-file.txt'))
  await symlink(outside, resolve(base, 'external-directory'))
  await symlink(base, resolve(directory, 'public-link'))
  const source = `import {serve} from ${JSON.stringify(pathToFileURL(resolve(root, 'scripts/http/server.mjs')).href)}; const server = await serve(process.argv[1]); console.log(server.origin)`
  const server = spawn(process.execPath, ['--input-type=module', '--eval', source, resolve(directory, 'public-link')], {cwd: root})
  t.after(() => {if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL')})
  const [message] = await once(server.stdout, 'data') as [Buffer]
  const origin = message.toString().trim()
  for (const path of ['/nested/inside.txt', '/internal-file.txt', '/internal-directory/inside.txt']) {
    const response = await fetch(origin + path)
    assert.equal(response.status, 200, path)
    assert.equal(await response.text(), 'inside')
  }
  for (const path of ['/external-file.txt', '/external-directory/secret.txt']) {
    const response = await fetch(origin + path)
    assert.equal(response.status, 403, path)
    assert.notEqual(await response.text(), 'outside')
  }
  assert.equal((await fetch(origin + '/missing')).status, 404)
})
