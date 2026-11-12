import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdir, mkdtemp, readFile, writeFile, rm, access} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'

const root = fileURLToPath(new URL('../../', import.meta.url))
async function fixture(t) {
  await mkdir(root + '/artifacts/work', {recursive: true})
  const directory = await mkdtemp(root + '/artifacts/work/snapshot-contract-')
  t.after(() => rm(directory, {recursive: true, force: true}))
  const module = directory + '/validator.mjs'
  await writeFile(module, `export async function validateCrate() {return {status:'valid',report:{highest_error_level:null,issues:{CRITICAL:[],ERROR:[],WARNING:[],INFO:[],DEBUG:[]}}}}\n`)
  return {directory, module}
}
async function preserve(t, path) {
  const before = await readFile(path).catch(error => {if (error.code !== 'ENOENT') throw error; return null})
  t.after(async () => before === null ? rm(path, {force: true}) : writeFile(path, before))
}

test('stdout-only snapshot comparisons preserve shared reports even when validation fails', async t => {
  const {module} = await fixture(t), path = root + '/artifacts/reports/installed-snapshot-parity.json'
  await mkdir(root + '/artifacts/reports', {recursive: true}); await preserve(t, path)
  await writeFile(path, 'owned by aggregate')
  const child = spawnSync(process.execPath, ['tests/parity/run.mjs', '--snapshot', '--stdout-only'],
    {cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 8e6,
      env: {...process.env, BIJUX_TEST_SHARD: '0/64', BIJUX_VALIDATOR_MODULE: new URL('file://' + module).href}})
  assert.equal(child.status, 1, child.stderr)
  assert.ok(JSON.parse(child.stdout).failures.length)
  assert.equal(await readFile(path, 'utf8'), 'owned by aggregate')
})

const all = Array.from({length: 24}, (_, index) => ({name: 'partition-proof/' + index, files: {'metadata.json': '{}'}}))
const digest = createHash('sha256').update(JSON.stringify(all)).digest('hex')
const binding = {source: 'a'.repeat(40), reference: 'b'.repeat(40), module: 'file:///validator/index.js',
  module_sha256: 'c'.repeat(64), node: '24.3.0', executable: '/pinned/node'}
const reports = () => Array.from({length: 12}, (_, index) => {
  const names = all.filter((_, position) => position % 12 === index).map(item => item.name)
  return {distribution: 'source', imported_module: binding.module, module_sha256: binding.module_sha256,
    node_version: binding.node, node_executable: binding.executable, reference: binding.reference,
    reference_kind: 'qualified-main', corpus_sha256: digest, mode: 'snapshot',
    selection: {suite: 'crate-parity', source_sha: binding.source, case_set_sha256: digest,
      full_case_count: all.length, shard: {index, total: 12}, case_names: names},
    actual_executed_case_names: [...names], ordinary_exact_cases: names.length, ordinary_exact_passed: names.length,
    qualified_collection_cases: 0, qualified_collection_passed: 0,
    total: names.length, passed: names.length, failed: 0, failures: []}
})

test('snapshot aggregation rejects missing, duplicate, failed and foreign partition evidence', async () => {
  const {aggregateSnapshotPartitions, assertSnapshotPartitions} = await import('../parity/snapshot-partitions.mjs')
  const complete = aggregateSnapshotPartitions(all, reports(), binding)
  assert.equal(complete.total, all.length)
  assertSnapshotPartitions(complete, all, binding)
  const staleRunner = structuredClone(complete); staleRunner.snapshot_partitions.runner_sha256 = '0'.repeat(64)
  assert.throws(() => assertSnapshotPartitions(staleRunner, all, binding), /runner bytes differ/)
  assert.deepEqual(complete.actual_executed_case_names, all.map(item => item.name))
  for (const mutate of [rows => rows.pop(), rows => {rows[1] = structuredClone(rows[0])},
    rows => {rows[0].passed--}, rows => {rows[0].failures.push({name: 'failure'})},
    rows => {rows[0].selection.source_sha = 'other'}, rows => {rows[0].selection.case_set_sha256 = 'other'},
    rows => {rows[0].imported_module = 'file:///other.js'}, rows => {rows[0].module_sha256 = '0'.repeat(64)},
    rows => {rows[0].node_executable = '/other/node'}, rows => {rows[0].node_version = '22.23.4'},
    rows => {rows[0].reference = 'other'}, rows => {rows[0].mode = 'live'}, rows => {rows[0].distribution = 'installed'},
    rows => {rows[0].ordinary_exact_passed++; rows[1].ordinary_exact_passed--},
    rows => {rows[0].actual_executed_case_names.reverse()}]) {
    const changed = reports(); mutate(changed)
    assert.throws(() => aggregateSnapshotPartitions(all, changed, binding))
  }
})

test('bounded snapshot workers overlap and await started siblings after a failure', async () => {
  const {executeSnapshotPartitions} = await import('../parity/snapshot-partitions.mjs')
  const started = [], releases = [], expected = reports()
  const running = executeSnapshotPartitions({all, binding, workers: 2, run: index => {
    started.push(index); return new Promise(resolve => {releases[index] = () => resolve(expected[index])})
  }})
  await new Promise(setImmediate); assert.deepEqual(started, [0, 1])
  for (let index = 0; index < 12; index++) {
    releases[index](); await new Promise(setImmediate)
  }
  assert.equal((await running).passed, all.length)
  let release, siblingFinished = false, settled = false, calls = 0
  const failed = executeSnapshotPartitions({all, binding, workers: 2, run: async index => {
    calls++
    if (index === 0) throw new Error('partition failed')
    await new Promise(resolve => {release = resolve}); siblingFinished = true; return expected[index]
  }})
  void failed.then(() => {settled = true}, () => {settled = true})
  await new Promise(setImmediate); assert.equal(settled, false); release()
  await assert.rejects(failed, /Snapshot partitions failed/)
  assert.equal(siblingFinished, true); assert.equal(calls, 2)
})

test('failed real snapshot partitions cannot retain an earlier aggregate success', async t => {
  const {module} = await fixture(t), path = root + '/artifacts/reports/installed-snapshot-parity.json'
  await preserve(t, path); await writeFile(path, 'stale success')
  const child = spawnSync(process.execPath, ['tests/parity/snapshot-partitions.mjs'],
    {cwd: root, encoding: 'utf8', timeout: 20000, maxBuffer: 8e6,
      env: {...process.env, BIJUX_VALIDATOR_MODULE: new URL('file://' + module).href}})
  assert.notEqual(child.status, 0)
  assert.match(child.stderr, /Snapshot partitions failed/)
  await assert.rejects(access(path), {code: 'ENOENT'})
})

test('a successful exit with failed comparison evidence cancels owned siblings', async () => {
  const {executeSnapshotPartitions} = await import('../parity/snapshot-partitions.mjs')
  const expected = reports(); let cancelled = false, calls = 0
  await assert.rejects(executeSnapshotPartitions({all, binding, workers: 2, run: async (index, signal) => {
    calls++
    if (index === 0) return {...expected[index], failed: 1}
    await new Promise(resolve => signal.addEventListener('abort', () => {cancelled = true; resolve()}, {once: true}))
    return expected[index]
  }}), /Snapshot partitions failed/)
  assert.equal(cancelled, true); assert.equal(calls, 2)
})

test('the overall deadline cancels and drains active partitions without scheduling successors', async () => {
  const {executeSnapshotPartitions} = await import('../parity/snapshot-partitions.mjs')
  const expected = reports(); let calls = 0, drained = 0
  await assert.rejects(executeSnapshotPartitions({all, binding, workers: 2, timeout: 25,
    run: async (index, signal) => {
      calls++
      await new Promise(resolve => signal.addEventListener('abort', () => {
        setTimeout(() => {drained++; resolve()}, 10)
      }, {once: true}))
      return expected[index]
    }}), error => error instanceof AggregateError && error.errors.some(item => /deadline/.test(item.message)))
  assert.equal(calls, 2); assert.equal(drained, 2)
  await assert.rejects(executeSnapshotPartitions({all, binding, timeout: 240000, run: () => assert.fail('must not start')}),
    /deadline must remain below/)
})
