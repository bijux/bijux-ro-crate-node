import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {cp, mkdir, mkdtemp, rm, symlink} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {createServer} from 'node:http'
import {resolve} from 'node:path'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'

const repository = fileURLToPath(new URL('../../../..', import.meta.url))
const originalApp = resolve(repository, 'apps/web')

function isConnectionRefused(error:unknown):boolean {
  return error instanceof TypeError && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ECONNREFUSED'
}

async function waitForDisappearance(present:() => boolean, pause:() => Promise<void>):Promise<void> {
  for (let attempt = 0; attempt < 21; attempt++) {
    if (!present()) return
    if (attempt < 20) await pause()
  }
  throw Error('The reported development server process is still present after shutdown')
}

test('shutdown waits for the reported process to disappear and remains bounded', async () => {
  let polls = 0
  await waitForDisappearance(() => ++polls < 3, async () => {})
  assert.equal(polls, 3)
  await assert.rejects(waitForDisappearance(() => true, async () => {}), /still present/)
})

test('only a refused connection proves the listener stopped', () => {
  assert.equal(isConnectionRefused(new TypeError('fetch failed', {cause:{code:'ECONNREFUSED'}})), true)
  assert.equal(isConnectionRefused(new DOMException('timed out', 'TimeoutError')), false)
  assert.equal(isConnectionRefused(new TypeError('fetch failed', {cause:{code:'ECONNRESET'}})), false)
})

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
  let pid:number | undefined
  let failure:unknown
  try {
    assert.equal(started.status, 0, 'Development server failed to start; see retained fixture log')
    const reported = started.stdout.match(/Dev server running at (http:\/\/127\.0\.0\.1:\d+) \(pid (\d+)\)/)
    assert.ok(reported, 'Startup response did not contain an address and PID; see retained fixture log')
    actual = reported[1]
    pid = Number(reported[2])
    assert.notEqual(new URL(actual).port, String(port))
    assert.equal((await fetch(`http://127.0.0.1:${port}/`, {signal:AbortSignal.timeout(5000)})).status, 418)
    const status = run('status')
    assert.equal(status.status, 0, 'Development server status failed; see retained fixture log')
    assert.ok(status.stdout.includes(`${actual} (pid ${reported[2]},`), 'Status did not match the started server')
    assert.equal((await fetch(`${actual}/preview/sign-in`, {signal:AbortSignal.timeout(5000)})).status, 200)
    assert.equal(existsSync(state), true)
    assert.equal(existsSync(resolve(app, '.astro')), false)
  } catch (error) {failure = error}
  try {
    // The fixture's stop command remains the cleanup route even if startup output could not be parsed.
    const stopped = run('stop')
    assert.equal(stopped.status, 0, 'Development server stop failed; see retained fixture log')
    if (pid) {
      assert.ok(stopped.stdout.includes(`Stopped dev server (pid ${pid}).`), 'Stop did not confirm the started PID')
      // Signal 0 only observes a PID: a zombie or reused PID may remain visible; never signal it to force cleanup.
      await waitForDisappearance(() => {
        try {process.kill(pid!, 0); return true}
        catch (error) {if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error}
      }, () => new Promise(resolve => setTimeout(resolve, 100)))
    }
    if (actual) await assert.rejects(fetch(`${actual}/preview/sign-in`, {signal:AbortSignal.timeout(5000)}), isConnectionRefused)
  } catch (error) {
    if (failure !== undefined) t.diagnostic('Development server cleanup also failed; see retained fixture log')
    else failure = error
  }
  if (failure !== undefined) throw failure
  passed = true
})
