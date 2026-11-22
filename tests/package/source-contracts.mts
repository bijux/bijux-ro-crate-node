import assert from 'node:assert/strict'
import {isAbsolute} from 'node:path'

export type Snapshot = Parameters<typeof import('../parity/snapshot-partitions.mjs').assertSnapshotPartitions>[0]
export type Binding = {node_version: string; distribution: string; imported_module: string}
export type ContractReport = Binding & {reference: string; suite_sha256: string; cases: number; actual_executed_case_names: string[]; approved_differences: number; outcomes?: {valid: number; invalid: number; incomplete: number}; input_limits?: number}
export type Qualification = {source_sha: string; node_version: string; snapshot: Snapshot; contracts: Array<{suite: string; report: ContractReport}>}

export interface SourceExpectations {
  readonly source: string
  readonly sourceModule: string
  readonly corpus: string
  readonly names: readonly string[]
  readonly nodes: readonly string[]
  readonly releaseNodes: readonly string[]
  readonly reference: string
  readonly suites: readonly {
    readonly name: string
    readonly contract: {
      readonly reference: {readonly reference: string; readonly suite_sha256: string}
      readonly cases: readonly {readonly name: string}[]
      readonly approvedDifferences: ReadonlySet<string>
    }
    readonly outcomes?: {readonly valid: number; readonly invalid: number; readonly incomplete: number}
  }[]
}

function assertBinding(report: Binding, node: string, expected: SourceExpectations) {
  assert.ok(expected.nodes.includes(node), 'Source qualification requires a pinned Node version')
  assert.equal(report.node_version, node)
  assert.equal(report.distribution, 'source')
  assert.equal(report.imported_module, expected.sourceModule, 'Source qualification imported another validator')
}

export function assertSnapshot(report: Snapshot, node: string, expected: SourceExpectations) {
  assertBinding(report, node, expected)
  assert.equal(report.mode, 'snapshot')
  assert.equal(report.reference_kind, 'qualified-main')
  assert.equal(report.reference, expected.reference)
  assert.equal(report.corpus_sha256, expected.corpus)
  const names = expected.names
  assert.deepEqual(report.selection, {suite: 'crate-parity', source_sha: expected.source,
    case_set_sha256: expected.corpus, full_case_count: names.length,
    shard: {index: 0, total: 1}, case_names: names})
  assert.deepEqual(report.actual_executed_case_names, names)
  assert.equal(report.total, names.length)
  assert.equal(report.passed, names.length)
  assert.equal(report.ordinary_exact_cases, names.length - 151)
  assert.equal(report.ordinary_exact_passed, names.length - 151)
  assert.equal(report.qualified_collection_cases, 151)
  assert.equal(report.qualified_collection_passed, 151)
  assert.equal(report.failed, 0)
  assert.deepEqual(report.failures, [])
  assert.ok(typeof report.node_executable === 'string' && isAbsolute(report.node_executable))

}

export function assertContract(name: string, report: ContractReport, node: string, expected: SourceExpectations) {
  const suite = expected.suites.find(item => item.name === name)
  assert.ok(suite, 'Unknown source qualification family')
  assertBinding(report, node, expected)
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

export function assertQualification(report: Qualification, node: string, expected: SourceExpectations) {
  assert.equal(report.source_sha, expected.source)
  assert.equal(report.node_version, node)
  assertSnapshot(report.snapshot, node, expected)
  assert.deepEqual(report.contracts.map(item => item.suite), expected.suites.map(item => item.name))
  for (const item of report.contracts) assertContract(item.suite, item.report, node, expected)
}

export function assertReleaseQualifications(reports: Qualification[], expected: SourceExpectations) {
  assert.equal(reports.length, expected.releaseNodes.length, 'Expected exactly two source Node qualification receipts')
  assert.deepEqual(reports.map(item => item.node_version).sort(), [...expected.releaseNodes].sort())
  for (const report of reports) assertQualification(report, report.node_version, expected)
}
