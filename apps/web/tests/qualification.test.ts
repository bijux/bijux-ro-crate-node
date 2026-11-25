import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {QualificationPool} from '../src/server/qualification/index.js'

const fixture = new URL('../../../tests/parity/fixtures/test_minimal_valid_ro_crate/', import.meta.url)
const files = async () => new Map(await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name => [name, new Uint8Array(await readFile(new URL(name, fixture)))] as const)))
const worker = new URL('../../../artifacts/web/dist/server/qualification/worker.mjs', import.meta.url)
const version = {versionId: 'saved-version', contentHash: 'server-content-hash'}

test('qualifies exact frozen bytes with default validation and preserves failures', async () => {
  const pool = new QualificationPool({worker, concurrency: 1, queue: 2, maxBytes: 2_000_000, deadlineMs: 15000})
  const input = await files()
  const goodPending = pool.qualify({version, files: input})
  for (const bytes of input.values()) bytes.fill(0)
  const good = await goodPending
  assert.equal(good.status, 'valid')
  assert.equal(good.policy, 'local-reference/default-validation')
  const original = await files()
  const modified = new Map(original)
  const metadata = JSON.parse(new TextDecoder().decode(original.get('ro-crate-metadata.json'))) as {'@graph': Array<Record<string, unknown>>}
  delete metadata['@graph'][1].name
  modified.set('ro-crate-metadata.json', new TextEncoder().encode(JSON.stringify(metadata)))
  const bad = await pool.qualify({version, files: modified})
  assert.equal(bad.status, 'invalid')
  assert.notEqual(good.digest, bad.digest)
  const incomplete = await pool.qualify({version, files: new Map()})
  assert.equal(incomplete.status, 'incomplete')
  pool.close()
})

test('terminates stalled workers, bounds the queue, and leaves the event loop responsive', async () => {
  const {build} = await import('esbuild')
  const {createServer} = await import('node:http')
  const harness = new URL('../../../artifacts/qualification-test/fault-worker.mjs', import.meta.url)
  await build({entryPoints: [new URL('./qualification/fault-worker.ts', import.meta.url).pathname], outfile: harness.pathname, bundle: true, platform: 'node', format: 'esm'})
  const pool = new QualificationPool({worker: harness, concurrency: 1, queue: 1, maxBytes: 100, deadlineMs: 400})
  const selection = {version, files: new Map([['stall', new Uint8Array()]])}
  const running = pool.qualify(selection)
  const cancel = new AbortController()
  const queued = pool.qualify(selection, cancel.signal)
  assert.equal((await pool.qualify(selection)).status, 'incomplete')
  cancel.abort()
  const cancelled = await queued
  assert.equal(cancelled.status, 'incomplete')
  if (cancelled.status === 'incomplete') assert.equal(cancelled.reason, 'cancelled')
  const server = createServer((_req, res) => res.end('available'))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('missing server address')
    assert.equal(await (await fetch(`http://127.0.0.1:${address.port}/`)).text(), 'available')
    const timedOut = await running
    assert.equal(timedOut.status, 'incomplete')
    if (timedOut.status === 'incomplete') assert.equal(timedOut.reason, 'deadline exceeded')
    assert.equal((await pool.qualify({version, files: new Map([['malformed', new Uint8Array()]])})).status, 'incomplete')
    const runningCancel = new AbortController()
    const cancelledRunning = pool.qualify(selection, runningCancel.signal)
    runningCancel.abort()
    const stopped = await cancelledRunning
    assert.equal(stopped.status, 'incomplete')
    if (stopped.status === 'incomplete') assert.equal(stopped.reason, 'cancelled')
    const crashed = await pool.qualify({version, files: new Map([['crash', new Uint8Array()]])})
    assert.equal(crashed.status, 'incomplete')
    if (crashed.status === 'incomplete') assert.equal(crashed.reason, 'worker failed')
    assert.equal((await pool.qualify({version, files: new Map([['oversized', new Uint8Array(101)]])})).status, 'incomplete')
  } finally {pool.close(); server.close()}
})

test('a valid result cannot approve another saved version or changed bytes', async () => {
  const {digestFrozenFiles, matchesSavedVersion} = await import('../src/server/qualification/index.js')
  const pool = new QualificationPool({worker, concurrency: 1, queue: 0, maxBytes: 2_000_000, deadlineMs: 15000})
  const result = await pool.qualify({version, files: await files()})
  assert.equal(matchesSavedVersion(result, version, digestFrozenFiles(await files())), true)
  assert.equal(matchesSavedVersion(result, {...version, versionId: 'other'}, result.digest), false)
  assert.equal(matchesSavedVersion(result, version, 'different'), false)
  pool.close()
})


test('the built service loads its compiled worker from another working directory', async () => {
  const built = new URL('../../../artifacts/web/dist/server/qualification/index.mjs', import.meta.url)
  const previous = process.cwd()
  process.chdir('/')
  try {
    const {QualificationPool: BuiltPool} = await import(built.href) as typeof import('../src/server/qualification/index.js')
    const pool = new BuiltPool({worker, concurrency: 1, queue: 0, maxBytes: 2_000_000, deadlineMs: 15000})
    assert.equal((await pool.qualify({version, files: await files()})).status, 'valid')
    pool.close()
  } finally {process.chdir(previous)}
})
