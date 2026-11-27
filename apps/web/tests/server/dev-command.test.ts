import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {cp, mkdir, mkdtemp, readFile, rm, symlink} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {createServer} from 'node:http'
import {resolve} from 'node:path'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'

const repository = fileURLToPath(new URL('../../../..', import.meta.url))
const originalApp = resolve(repository, 'apps/web')

test('development server keeps state in artifacts and stops through the same command', async t => {
  const work = resolve(repository, 'artifacts/work')
  await mkdir(work, {recursive:true})
  const fixture = await mkdtemp(resolve(work, 'web-dev-'))
  let passed = false
  t.after(async () => {
    if (passed) await rm(fixture, {recursive:true, force:true})
    else t.diagnostic(`Development server fixture and log retained at ${fixture}`)
  })
  const app = resolve(fixture, 'apps/web')
  await mkdir(app, {recursive:true})
  for (const file of ['dev.mts', 'astro.config.ts', 'boundaries.ts', 'package.json', 'src', 'public'])
    await cp(resolve(originalApp, file), resolve(app, file), {recursive:true})
  await symlink(resolve(repository, 'node_modules'), resolve(fixture, 'node_modules'), 'dir')
  await symlink(resolve(repository, 'packages'), resolve(fixture, 'packages'), 'dir')
  await symlink(resolve(originalApp, 'node_modules'), resolve(app, 'node_modules'), 'dir')
  const entry = resolve(app, 'dev.mts')
  const state = resolve(fixture, 'artifacts/web/project/.astro')
  const probe = createServer((_request, response) => {response.writeHead(418).end('occupied')})
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve))
  const address = probe.address()
  if (!address || typeof address === 'string') throw Error('Could not allocate a local test port')
  const port = address.port
  t.after(() => new Promise<void>((resolve, reject) => {probe.closeAllConnections(); probe.close(error => error ? reject(error) : resolve())}))
  const run = (...args:string[]) => spawnSync(process.execPath, ['--import', 'tsx', entry, ...args], {cwd:app, env:{...process.env, BSS_MODE:'standalone'}, encoding:'utf8'})
  const started = run('--background', '--port', String(port), '--host', '127.0.0.1')
  let actual:string | undefined
  try {
    const log = await readFile(resolve(state, 'dev.log'), 'utf8').catch(() => '')
    assert.equal(started.status, 0, `${started.stderr}\n${log}`)
    const reported = started.stdout.match(/Dev server running at (http:\/\/127\.0\.0\.1:\d+) \(pid (\d+)\)/)
    assert.ok(reported, `Missing server address and PID: ${started.stdout}\n${started.stderr}\n${log}`)
    actual = reported[1]
    assert.notEqual(new URL(actual).port, String(port))
    assert.equal((await fetch(`http://127.0.0.1:${port}/`, {signal:AbortSignal.timeout(5000)})).status, 418)
    const status = run('status')
    assert.equal(status.status, 0, status.stderr)
    assert.ok(status.stdout.includes(`${actual} (pid ${reported[2]},`), status.stdout)
    assert.equal((await fetch(`${actual}/preview/sign-in`, {signal:AbortSignal.timeout(5000)})).status, 200)
    assert.equal(existsSync(state), true)
    assert.equal(existsSync(resolve(app, '.astro')), false)
  } finally {
    const stopped = run('stop')
    assert.equal(stopped.status, 0, stopped.stderr)
    if (actual) await assert.rejects(fetch(`${actual}/preview/sign-in`, {signal:AbortSignal.timeout(5000)}))
  }
  passed = true
})
