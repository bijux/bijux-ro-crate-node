import assert from 'node:assert/strict'
import test from 'node:test'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {aggregateSnapshotPartitions} from '../parity/snapshot-partitions.mjs'
import {collectionCases} from '../parity/qualification.mjs'
import {execFileSync, spawnSync} from 'node:child_process'
import {assertSnapshot, assertContract, assertQualification} from '../package/source.mjs'
import {makeCases} from '../parity/cases.mjs'
import * as upstream from '../reference/upstream-defects/checks.mjs'
import * as reserved from '../reference/reserved-type-identifiers/observers/checks.mjs'
import * as processing from '../reference/jsonld-processing/checks.mjs'
import * as prefixes from '../reference/model-type-prefixes/checks.mjs'

const root = new URL('../../', import.meta.url)
const source = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim()
const all = await makeCases(), names = all.map(item => item.name)
const corpus = createHash('sha256').update(JSON.stringify(all)).digest('hex')
const module = new URL('../../packages/validator/src/index.js', import.meta.url).href
const binding = node => ({distribution: 'source', node_version: node, imported_module: module})
const moduleHash = createHash('sha256').update(await readFile(new URL(module))).digest('hex')
const snapshot = node => {
  const executable = '/pinned/node-' + node
  const reports = Array.from({length: 12}, (_, index) => {
    const selected = all.filter((_, position) => position % 12 === index), selectedNames = selected.map(item => item.name)
    const qualified = collectionCases(selected).length
    return {...binding(node), mode: 'snapshot', node_executable: executable, module_sha256: moduleHash,
      reference_kind: 'qualified-main', reference: upstream.reference.reference, corpus_sha256: corpus,
      total: selected.length, passed: selected.length, failed: 0, failures: [],
      ordinary_exact_cases: selected.length - qualified, ordinary_exact_passed: selected.length - qualified,
      qualified_collection_cases: qualified, qualified_collection_passed: qualified,
      selection: {suite: 'crate-parity', source_sha: source, case_set_sha256: corpus, full_case_count: all.length,
        shard: {index, total: 12}, case_names: selectedNames}, actual_executed_case_names: selectedNames}
  })
  return aggregateSnapshotPartitions(all, reports, {source, module, module_sha256: moduleHash, node,
    executable, reference: upstream.reference.reference})
}
const contract = (family, node, outcomes) => ({...binding(node), reference: family.reference.reference,
  suite_sha256: family.reference.suite_sha256, cases: family.cases.length,
  actual_executed_case_names: family.cases.map(item => item.name),
  approved_differences: family.approvedDifferences.size, ...(outcomes ? {outcomes, input_limits: 0} : {})})
const qualification = node => ({source_sha: source, node_version: node, snapshot: snapshot(node), contracts: [
  {suite: 'upstream', report: contract(upstream, node)},
  {suite: 'reserved-types', report: contract(reserved, node, {valid: 0, invalid: 6, incomplete: 0})},
  {suite: 'jsonld-processing', report: contract(processing, node, {valid: 4, invalid: 37, incomplete: 39})},
  {suite: 'model-type-prefixes', report: contract(prefixes, node, {valid: 5, invalid: 15, incomplete: 0})},
]})

for (const node of ['22.23.4', '24.3.0']) test('source qualification admits exact reports on Node ' + node, () => {
  assertQualification(qualification(node), node)
})

test('ordinary source admission rejects partial execution and altered provenance', () => {
  for (const change of [
    report => {report.snapshot_partitions.runner_sha256 = '0'.repeat(64)},
    report => {report.snapshot_partitions.reports.pop()},
    report => {report.snapshot_partitions.reports[0].selection.source_sha = 'other'},
    report => {report.module_sha256 = '0'.repeat(64)},
    report => {report.distribution = 'installed'}, report => {report.imported_module = 'file:///another/validator.js'},
    report => {report.node_version = '24.0.0'}, report => {report.reference = 'another reference'},
    report => {report.ordinary_exact_cases = names.length},
    report => {report.qualified_collection_passed = 0},
    report => {report.corpus_sha256 = '0'.repeat(64)}, report => {report.mode = 'live'},
    report => {report.selection.source_sha = 'another commit'}, report => {report.selection.shard = {index: 0, total: 2}},
    report => {report.selection.case_names.pop()}, report => {report.actual_executed_case_names.pop()},
    report => {report.total--}, report => {report.passed--}, report => {report.failed++},
    report => {report.failures.push({name: names[0]})},
  ]) {
    const report = snapshot('24.3.0'); change(report)
    assert.throws(() => assertSnapshot(report, '24.3.0'))
  }
})

test('source family admission requires every case and the exact source module', () => {
  for (const {suite, report: original} of qualification('24.3.0').contracts) {
    for (const change of [
      report => {report.distribution = 'installed'}, report => {report.imported_module = 'file:///another/module.js'},
      report => {report.node_version = '22.23.4'}, report => {report.reference = 'another reference'},
      report => {report.suite_sha256 = '0'.repeat(64)}, report => {report.cases--},
      report => {report.actual_executed_case_names.reverse()}, report => {report.approved_differences--},
    ]) {
      const report = structuredClone(original); change(report)
      assert.throws(() => assertContract(suite, report, '24.3.0'))
    }
    if (original.outcomes) for (const change of [
      report => {report.outcomes.valid++}, report => {report.input_limits++},
    ]) {
      const report = structuredClone(original); change(report)
      assert.throws(() => assertContract(suite, report, '24.3.0'))
    }
  }
  assert.throws(() => assertContract('unknown', {}, '24.3.0'))
})

test('prefix qualification requires all twenty cases and their exact completion outcomes', () => {
  assert.equal(prefixes.cases.length, 20)
  assert.equal(prefixes.approvedDifferences.size, 0)
  const valid = contract(prefixes, '24.3.0', {valid: 5, invalid: 15, incomplete: 0})
  assertContract('model-type-prefixes', valid, '24.3.0')
  for (const change of [
    report => {report.outcomes.incomplete = 0; report.outcomes.invalid = 18},
    report => {report.outcomes.valid = 8; report.outcomes.incomplete = 0},
    report => {report.actual_executed_case_names.pop(); report.cases--},
    report => {report.imported_module = new URL('../../packages/validator/dist/index.js', import.meta.url).href},
  ]) {
    const report = structuredClone(valid); change(report)
    assert.throws(() => assertContract('model-type-prefixes', report, '24.3.0'))
  }
})

test('source qualification rejects missing families and mismatched source receipts', () => {
  for (const change of [
    report => {report.source_sha = 'another commit'}, report => {report.node_version = '22.23.4'},
    report => {report.contracts.pop()}, report => {report.contracts.reverse()},
    report => {report.contracts.push(report.contracts[0])},
  ]) {
    const report = qualification('24.3.0'); change(report)
    assert.throws(() => assertQualification(report, '24.3.0'))
  }
})

test('source runner rejects external module and shard bindings before any validation', () => {
  const path = new URL('../package/source.mjs', import.meta.url).pathname
  for (const env of [{BIJUX_VALIDATOR_MODULE: module}, {BIJUX_VALIDATOR_MODULE: ''}, {BIJUX_TEST_SHARD: '0/1'}]) {
    const child = spawnSync(process.execPath, [path, '--upstream'], {cwd: root, encoding: 'utf8',
      env: {...process.env, BIJUX_TEST_NODE: process.versions.node, ...env}, timeout: 10000})
    assert.notEqual(child.status, 0)
    assert.match(child.stderr, /Source qualification (?:owns the validator binding|must execute every case)/)
  }
})
