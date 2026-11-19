import assert from 'node:assert/strict'

type PackageRecord = {name: string; directory: string; archive: string; sha256: string; integrity: string; files: string[]}
type SnapshotReceipt = {node_version: string; distribution: string; failed: number; passed: number; total: number; reference_kind: string; qualified_collection_cases: number; qualified_collection_passed: number; ordinary_exact_cases: number; ordinary_exact_passed: number; corpus_sha256: string; imported_module: string}
type NodeReceipt = {distribution: string; node_version: string; imported_module: string; cases: number; approved_differences: number; input_limits?: unknown; outcomes?: unknown}

export function parseJson(text: string): unknown { return JSON.parse(text) }
function record(value: unknown): asserts value is Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected a JSON object')
}
function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key]
  assert.ok(typeof field === 'string', 'Expected string field: ' + key)
  return field
}
function numberField(value: Record<string, unknown>, key: string): number {
  const field = value[key]
  assert.ok(typeof field === 'number', 'Expected number field: ' + key)
  return field
}
export function packageRecords(value: unknown): PackageRecord[] {
  assert.ok(Array.isArray(value), 'Expected package records')
  return value.map((item: unknown) => {
    record(item)
    assert.ok(Array.isArray(item.files) && item.files.every((file: unknown) => typeof file === 'string'), 'Expected package file paths')
    return {...item, name: stringField(item, 'name'), directory: stringField(item, 'directory'), archive: stringField(item, 'archive'),
      sha256: stringField(item, 'sha256'), integrity: stringField(item, 'integrity'), files: item.files}
  })
}
export function packageLockField(value: unknown, name: string, key: 'integrity' | 'version'): string {
  record(value); record(value.packages); const item = value.packages[name]; record(item)
  return stringField(item, key)
}
export function versionField(value: unknown): string { record(value); return stringField(value, 'version') }
export function packedFilename(value: unknown): string {
  assert.ok(Array.isArray(value) && value.length > 0, 'Expected npm pack receipt')
  record(value[0]); return stringField(value[0], 'filename')
}
export function snapshotReceipt(value: unknown): SnapshotReceipt {
  record(value)
  for (const key of ['node_version', 'distribution', 'reference_kind', 'corpus_sha256', 'imported_module']) stringField(value, key)
  for (const key of ['failed', 'passed', 'total', 'qualified_collection_cases', 'qualified_collection_passed', 'ordinary_exact_cases', 'ordinary_exact_passed']) numberField(value, key)
  return { ...value, node_version: stringField(value, 'node_version'), distribution: stringField(value, 'distribution'),
    reference_kind: stringField(value, 'reference_kind'), corpus_sha256: stringField(value, 'corpus_sha256'), imported_module: stringField(value, 'imported_module'),
    failed: numberField(value, 'failed'), passed: numberField(value, 'passed'), total: numberField(value, 'total'),
    qualified_collection_cases: numberField(value, 'qualified_collection_cases'), qualified_collection_passed: numberField(value, 'qualified_collection_passed'),
    ordinary_exact_cases: numberField(value, 'ordinary_exact_cases'), ordinary_exact_passed: numberField(value, 'ordinary_exact_passed')}
}
export function nodeReceipt(value: unknown): NodeReceipt {
  record(value)
  return {...value, distribution: stringField(value, 'distribution'), node_version: stringField(value, 'node_version'),
    imported_module: stringField(value, 'imported_module'), cases: numberField(value, 'cases'), approved_differences: numberField(value, 'approved_differences')}
}
export function nativeReceipt(value: unknown) {
  record(value); return {...value, node: stringField(value, 'node'), passed: numberField(value, 'passed')}
}
export function numericReceipt(value: unknown) {
  record(value); return {...value, distribution: stringField(value, 'distribution'), node_version: stringField(value, 'node_version'),
    imported_module: stringField(value, 'imported_module'), cases: numberField(value, 'cases'), platform_dependent: numberField(value, 'platform_dependent')}
}
export function lifecycleReceipt(value: unknown) {
  record(value); return {...value, corePath: stringField(value, 'corePath'), distribution: stringField(value, 'distribution')}
}

export function withoutRootName(text: string): unknown {
  const value = parseJson(text)
  record(value)
  assert.ok(Array.isArray(value['@graph']), 'Expected metadata graph')
  const root = value['@graph'].find((item: unknown) => { record(item); return item['@id'] === './' })
  record(root)
  delete root.name
  return value
}
