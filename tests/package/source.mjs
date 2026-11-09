import assert from 'node:assert/strict'
import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises'
import {spawnSync, execFileSync} from 'node:child_process'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {makeCases} from '../parity/cases.mjs'
import * as upstream from '../reference/upstream-defects/checks.mjs'
import * as reserved from '../reference/reserved-type-identifiers/observers/checks.mjs'
import * as processing from '../reference/jsonld-processing/checks.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const sourceModule = new URL('../../packages/validator/src/index.js', import.meta.url).href
const nodes = ['22.23.4', '24.3.0']
const all = await makeCases()
const corpus = createHash('sha256').update(JSON.stringify(all)).digest('hex')
const source = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim()
const suites = [
  {name: 'upstream', path: 'tests/reference/upstream-defects/run.mjs', contract: upstream},
  {name: 'reserved-types', path: 'tests/reference/reserved-type-identifiers/observers/run.mjs', contract: reserved,
    outcomes: {valid: 0, invalid: 6, incomplete: 0}},
  {name: 'jsonld-processing', path: 'tests/reference/jsonld-processing/run.mjs', contract: processing,
    outcomes: {valid: 4, invalid: 37, incomplete: 39}},
]

function assertBinding(report, node) {
  assert.ok(nodes.includes(node), 'Source qualification requires a pinned Node version')
  assert.equal(report.node_version, node)
  assert.equal(report.distribution, 'source')
  assert.equal(report.imported_module, sourceModule, 'Source qualification imported another validator')
}

export function assertSnapshot(report, node) {
  assertBinding(report, node)
  assert.equal(report.mode, 'snapshot')
  assert.equal(report.reference, upstream.reference.reference)
  assert.equal(report.corpus_sha256, corpus)
  const names = all.map(item => item.name)
  assert.deepEqual(report.selection, {suite: 'crate-parity', source_sha: source,
    case_set_sha256: corpus, full_case_count: names.length,
    shard: {index: 0, total: 1}, case_names: names})
  assert.deepEqual(report.actual_executed_case_names, names)
  assert.equal(report.total, names.length)
  assert.equal(report.passed, names.length)
  assert.equal(report.failed, 0)
  assert.deepEqual(report.failures, [])
}

export function assertContract(name, report, node) {
  const suite = suites.find(item => item.name === name)
  assert.ok(suite, 'Unknown source qualification family')
  assertBinding(report, node)
  assert.equal(report.reference, suite.contract.reference.reference)
  assert.equal(report.suite_sha256, suite.contract.reference.suite_sha256)
  assert.equal(report.cases, suite.contract.cases.length)
  assert.deepEqual(report.actual_executed_case_names, suite.contract.cases.map(item => item.name))
  assert.equal(report.approved_differences, suite.contract.approvedDifferences.size)
  if (suite.outcomes) {
    assert.deepEqual(report.outcomes, suite.outcomes)
    assert.equal(report.input_limits, 0)
  }
}

export function assertQualification(report, node) {
  assert.equal(report.source_sha, source)
  assert.equal(report.node_version, node)
  assertSnapshot(report.snapshot, node)
  assert.deepEqual(report.contracts.map(item => item.suite), suites.map(item => item.name))
  for (const item of report.contracts) assertContract(item.suite, item.report, node)
}

function run(path, args = []) {
  const child = spawnSync(process.execPath, [path, ...args], {cwd: root,
    env: process.env, encoding: 'utf8', timeout: 240000, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024})
  assert.equal(child.status, 0, [child.error?.message, child.stderr, child.stdout].filter(Boolean).join('\n') ||
    'Source qualification failed')
  return JSON.parse(child.stdout)
}

async function main() {
  const [mode, ...extra] = process.argv.slice(2)
  assert.ok(!extra.length && [undefined, '--upstream', '--verify'].includes(mode), 'Use [--upstream|--verify]')
  assert.ok(!Object.hasOwn(process.env, 'BIJUX_VALIDATOR_MODULE'), 'Source qualification owns the validator binding')
  assert.ok(!Object.hasOwn(process.env, 'BIJUX_TEST_SHARD'), 'Source qualification must execute every case')
  if (mode === '--verify') {
    const directory = resolve(root, 'artifacts/reports/qualification/source')
    const files = (await readdir(directory, {recursive: true})).filter(path => path.endsWith('.json')).sort()
    assert.equal(files.length, nodes.length, 'Expected exactly two source Node qualification receipts')
    const reports = await Promise.all(files.map(async path => JSON.parse(await readFile(resolve(directory, path), 'utf8'))))
    assert.deepEqual(reports.map(item => item.node_version).sort(), [...nodes].sort())
    for (const report of reports) assertQualification(report, report.node_version)
    console.log('Both source Node qualifications match this source and every required case')
    return
  }
  const node = process.env.BIJUX_TEST_NODE
  assert.equal(process.versions.node, node, 'Source qualification must run the selected Node executable')
  assert.ok(nodes.includes(node), 'Source qualification requires a pinned Node version')
  await mkdir(resolve(root, 'artifacts/reports'), {recursive: true})
  if (mode === '--upstream') {
    const report = run(suites[0].path)
    assertContract('upstream', report, node)
    await writeFile(resolve(root, `artifacts/reports/source-upstream-node${node.split('.')[0]}.json`), JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify(report))
    return
  }
  const snapshot = run('tests/parity/run.mjs', ['--snapshot'])
  assertSnapshot(snapshot, node)
  const contracts = suites.map(item => {
    const report = run(item.path)
    assertContract(item.name, report, node)
    return {suite: item.name, report}
  })
  const report = {source_sha: source, node_version: node, snapshot, contracts}
  assertQualification(report, node)
  await writeFile(resolve(root, `artifacts/reports/source-package-node${node.split('.')[0]}.json`), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({source_sha: source, node_version: node, ordinary: snapshot.total,
    contracts: contracts.map(item => ({suite: item.suite, cases: item.report.cases}))}))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
