import assert from 'node:assert/strict'
import {spawn, execFileSync} from 'node:child_process'
import {createHash, type BinaryLike} from 'node:crypto'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {relative, resolve} from 'node:path'
import {makeCases} from './cases.mjs'
import {collectionCases} from './qualification.mjs'
import {verifyCoverage} from '../support/coverage.mjs'
import type {SelectionReceipt} from '../support/selection.mjs'

interface Binding {source: string; reference: string; module: string; module_sha256: string; node: string; executable: string; distribution?: string}
interface SnapshotReport {
  distribution: string; imported_module: string; module_sha256: string; node_version: string; node_executable: string
  reference: string; reference_kind: string; mode: string; corpus_sha256: string; selection: SelectionReceipt
  actual_executed_case_names: string[]; ordinary_exact_cases: number; ordinary_exact_passed: number
  qualified_collection_cases: number; qualified_collection_passed: number; total: number; passed: number; failed: number; failures: unknown[]
}
interface SnapshotEvidence<T extends SnapshotReport> {coverage: ReturnType<typeof verifyCoverage>; runner_sha256: string; reports: T[]; workers?: number; receipt_directory?: string; elapsed_ms?: number}
type AggregateReport<T extends SnapshotReport> = Omit<T, 'selection' | 'actual_executed_case_names' | 'failures' | 'snapshot_partitions' | typeof counts[number]> & Record<typeof counts[number], number> & {selection: SelectionReceipt; actual_executed_case_names: string[]; failures: unknown[]; snapshot_partitions: SnapshotEvidence<T>}
interface PartitionOptions<T extends SnapshotReport> {all: readonly {name: string}[]; binding: Binding; workers?: number; timeout?: number; run(index: number, signal: AbortSignal): Promise<T>}

const root = fileURLToPath(new URL('../../', import.meta.url))
const partitions = 12
const hash = (value: BinaryLike) => createHash('sha256').update(value).digest('hex')
const runnerHash = hash(await readFile(fileURLToPath(import.meta.url)))
const counts = ['ordinary_exact_cases', 'ordinary_exact_passed', 'qualified_collection_cases', 'qualified_collection_passed', 'total', 'passed', 'failed'] as const

function partitionPlan(all: readonly {name: string}[], digest = hash(JSON.stringify(all))) {
  return {digest, total: all.length, selections: Array.from({length: partitions}, (_, index) => {
    const selected = all.filter((_, position) => position % partitions === index)
    return {names: selected.map(item => item.name), qualified: collectionCases(selected).length}
  })}
}

function assertPartition(plan: ReturnType<typeof partitionPlan>, report: SnapshotReport, binding: Binding, index: number) {
  const {names, qualified} = plan.selections[index], {digest} = plan
  assert.equal(report.distribution, binding.distribution ?? 'source', 'Partition distribution differs')
  assert.equal(report.imported_module, binding.module, 'Partition module differs')
  assert.equal(report.module_sha256, binding.module_sha256, 'Partition module bytes differ')
  assert.equal(report.node_version, binding.node, 'Partition Node version differs')
  assert.equal(report.node_executable, binding.executable, 'Partition Node executable differs')
  assert.equal(report.reference, binding.reference, 'Partition Python reference differs')
  assert.equal(report.reference_kind, 'qualified-main')
  assert.equal(report.mode, 'snapshot')
  assert.equal(report.corpus_sha256, digest)
  assert.deepEqual(report.selection, {suite: 'crate-parity', source_sha: binding.source,
    case_set_sha256: digest, full_case_count: plan.total, shard: {index, total: partitions}, case_names: names})
  assert.deepEqual(report.actual_executed_case_names, names)
  assert.equal(report.total, names.length); assert.equal(report.passed, names.length)
  assert.equal(report.failed, 0); assert.deepEqual(report.failures, [])
  assert.equal(report.ordinary_exact_cases, names.length - qualified)
  assert.equal(report.ordinary_exact_passed, names.length - qualified)
  assert.equal(report.qualified_collection_cases, qualified)
  assert.equal(report.qualified_collection_passed, qualified)
}

/** Aggregate only complete, independently bound execution receipts in corpus order. */
export function aggregateSnapshotPartitions<T extends SnapshotReport>(all: readonly {name: string}[], reports: readonly T[], binding: Binding): AggregateReport<T> {
  const coverage = verifyCoverage(all, reports, {suite: 'crate-parity', source: binding.source, shards: partitions})
  const plan = partitionPlan(all, coverage.case_set_sha256)
  for (const report of reports) assertPartition(plan, report, binding, report.selection.shard.index)
  const ordered = [...reports].sort((a, b) => a.selection.shard.index - b.selection.shard.index)
  const totals = Object.fromEntries(counts.map(key => [key, ordered.reduce((sum, report) => sum + report[key], 0)])) as Record<typeof counts[number], number>
  return {...ordered[0], ...totals,
    selection: {...ordered[0].selection, shard: {index: 0, total: 1}, case_names: all.map(item => item.name)},
    actual_executed_case_names: all.map(item => item.name), failures: [],
    snapshot_partitions: {coverage, runner_sha256: runnerHash, reports: structuredClone(ordered)}}
}

/** Stop scheduling on failure, cancel owned work, and drain every started worker. */
export async function executeSnapshotPartitions<T extends SnapshotReport>({all, binding, workers = 2, timeout = 220000, run}: PartitionOptions<T>) {
  assert.ok(workers === 2 || workers === 4, 'Snapshot workers must be 2 or 4')
  assert.ok(Number.isFinite(timeout) && timeout > 0 && timeout <= 220000, 'Snapshot deadline must remain below its caller timeout')
  assert.ok(all.length >= partitions, 'Every snapshot partition requires input')
  const plan = partitionPlan(all), reports: T[] = new Array(partitions), failures: unknown[] = [], controller = new AbortController()
  let next = 0
  const deadline = setTimeout(() => {
    failures.push(new Error('Snapshot qualification exceeded its ' + timeout + ' ms deadline'))
    controller.abort()
  }, timeout)
  try {
    await Promise.all(Array.from({length: workers}, async () => {
      while (next < partitions && !failures.length) {
        const index = next++
        try {
          const report = await run(index, controller.signal)
          assertPartition(plan, report, binding, index)
          reports[index] = report
        } catch (error) {failures.push(error); controller.abort()}
      }
    }))
  } finally {clearTimeout(deadline)}
  if (failures.length) throw new AggregateError(failures, 'Snapshot partitions failed')
  return aggregateSnapshotPartitions(all, reports, binding)
}

/** Admission rechecks the retained partition evidence, including counts and provenance. */
export function assertSnapshotPartitions<T extends SnapshotReport>(report: AggregateReport<T>, all: readonly {name: string}[], binding: Binding) {
  const aggregate = aggregateSnapshotPartitions(all, report.snapshot_partitions?.reports ?? [], binding)
  for (const [key, value] of Object.entries(aggregate)) {
    if (key === 'snapshot_partitions') {
      assert.deepEqual(report.snapshot_partitions.coverage, (value as SnapshotEvidence<T>).coverage)
      assert.equal(report.snapshot_partitions.runner_sha256, (value as SnapshotEvidence<T>).runner_sha256, 'Snapshot runner bytes differ')
    }
    else assert.deepEqual(report[key as keyof typeof report], value, 'Snapshot aggregate differs: ' + key)
  }
}

async function main() {
  const args = process.argv.slice(2)
  assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--workers' && ['2', '4'].includes(args[1])),
    'Use [--workers 2|4]')
  assert.ok(!Object.hasOwn(process.env, 'BIJUX_TEST_SHARD'), 'Snapshot qualification owns all partitions')
  const workers = args.length ? Number(args[1]) : 2
  const all = await makeCases()
  const module = new URL(process.env.BIJUX_VALIDATOR_MODULE ?? '../../packages/validator/src/index.ts', import.meta.url)
  assert.equal(module.protocol, 'file:', 'Snapshot qualification requires a local module')
  const reference = JSON.parse(await readFile(new URL('../../docs/compatibility/reference.json', import.meta.url), 'utf8')) as {commit: string}
  const binding = {source: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
    distribution: Object.hasOwn(process.env, 'BIJUX_VALIDATOR_MODULE') ? 'installed' : 'source',
    module: module.href, module_sha256: hash(await readFile(module)), node: process.versions.node,
    executable: process.execPath, reference: reference.commit}
  const owner = resolve(root, 'artifacts/reports/snapshot-partitions', binding.source, 'node-' + binding.node, binding.distribution)
  await mkdir(owner, {recursive: true})
  const directory = await mkdtemp(owner + '/attempt-')
  const output = resolve(root, 'artifacts/reports/' + binding.distribution + '-snapshot-parity.json')
  await rm(output, {force: true})
  const started = performance.now()
  const run = (index: number, signal: AbortSignal) => new Promise<SnapshotReport>((accept, reject) => {
    const began = performance.now()
    const loader = Object.hasOwn(process.env, 'BIJUX_VALIDATOR_MODULE') ? [] : ['--import', 'tsx']
    const child = spawn(process.execPath, [...loader, resolve(root, 'tests/parity/run.mjs'), '--snapshot', '--stdout-only'],
      {cwd: root, env: {...process.env, BIJUX_TEST_SHARD: index + '/' + partitions}, signal,
        timeout: 240000, killSignal: 'SIGKILL'})
    let stdout = '', stderr = '', failure: Error | undefined
    child.stdout.on('data', data => {
      stdout += data
      if (Buffer.byteLength(stdout) > 16 * 1024 * 1024) {failure ??= new Error('Snapshot output exceeded 16 MiB'); child.kill('SIGKILL')}
    })
    child.stderr.on('data', data => {stderr += data})
    child.once('error', error => {failure ??= error})
    child.once('close', async (code, childSignal) => {
      try {
        await writeFile(resolve(directory, index + '.stdout.json'), stdout, {flag: 'wx'})
        await writeFile(resolve(directory, index + '.stderr.log'), stderr, {flag: 'wx'})
        await writeFile(resolve(directory, index + '.execution.json'), JSON.stringify({index, code, signal: childSignal,
          executable: process.execPath, elapsed_ms: performance.now() - began}, null, 2) + '\n', {flag: 'wx'})
        if (failure) throw failure
        assert.equal(code, 0, 'Snapshot partition ' + index + ' exited ' + (childSignal ?? code))
        const report: SnapshotReport = JSON.parse(stdout)
        console.error('snapshot partition ' + index + ': ' + report.total + ' cases in ' + Math.round(performance.now() - began) + ' ms')
        accept(report)
      } catch (error) {reject(error)}
    })
  })
  const report = await executeSnapshotPartitions({all, binding, workers, run})
  report.snapshot_partitions.workers = workers
  report.snapshot_partitions.receipt_directory = relative(root, directory)
  report.snapshot_partitions.elapsed_ms = performance.now() - started
  await writeFile(resolve(directory, 'aggregate.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'})
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => {console.error(error); process.exitCode = 1})
