// Generated from tests/package/harness/receipts.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
export function parseJson(text) { return JSON.parse(text); }
function record(value) {
    assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected a JSON object');
}
function stringField(value, key) {
    const field = value[key];
    assert.ok(typeof field === 'string', 'Expected string field: ' + key);
    return field;
}
function numberField(value, key) {
    const field = value[key];
    assert.ok(typeof field === 'number', 'Expected number field: ' + key);
    return field;
}
export function packageRecords(value) {
    assert.ok(Array.isArray(value), 'Expected package records');
    return value.map((item) => {
        record(item);
        assert.ok(Array.isArray(item.files) && item.files.every((file) => typeof file === 'string'), 'Expected package file paths');
        record(item.dependencies);
        assert.ok(Object.values(item.dependencies).every(value => typeof value === 'string'), 'Expected package dependency versions');
        return { ...item, version: stringField(item, 'version'), dependencies: item.dependencies, name: stringField(item, 'name'), directory: stringField(item, 'directory'), archive: stringField(item, 'archive'),
            sha256: stringField(item, 'sha256'), integrity: stringField(item, 'integrity'), files: item.files };
    });
}
export function packageLockField(value, name, key) {
    record(value);
    record(value.packages);
    const item = value.packages[name];
    record(item);
    return stringField(item, key);
}
export function versionField(value) { record(value); return stringField(value, 'version'); }
export function packedFilename(value) {
    assert.ok(Array.isArray(value) && value.length > 0, 'Expected npm pack receipt');
    record(value[0]);
    return stringField(value[0], 'filename');
}
export function snapshotReceipt(value) {
    record(value);
    for (const key of ['node_version', 'distribution', 'reference_kind', 'corpus_sha256', 'imported_module'])
        stringField(value, key);
    for (const key of ['failed', 'passed', 'total', 'qualified_collection_cases', 'qualified_collection_passed', 'ordinary_exact_cases', 'ordinary_exact_passed'])
        numberField(value, key);
    return { ...value, node_version: stringField(value, 'node_version'), distribution: stringField(value, 'distribution'),
        reference_kind: stringField(value, 'reference_kind'), corpus_sha256: stringField(value, 'corpus_sha256'), imported_module: stringField(value, 'imported_module'),
        failed: numberField(value, 'failed'), passed: numberField(value, 'passed'), total: numberField(value, 'total'),
        qualified_collection_cases: numberField(value, 'qualified_collection_cases'), qualified_collection_passed: numberField(value, 'qualified_collection_passed'),
        ordinary_exact_cases: numberField(value, 'ordinary_exact_cases'), ordinary_exact_passed: numberField(value, 'ordinary_exact_passed') };
}
export function nodeReceipt(value) {
    record(value);
    return { ...value, distribution: stringField(value, 'distribution'), node_version: stringField(value, 'node_version'),
        imported_module: stringField(value, 'imported_module'), cases: numberField(value, 'cases'), approved_differences: numberField(value, 'approved_differences') };
}
export function nativeReceipt(value) {
    record(value);
    return { ...value, node: stringField(value, 'node'), passed: numberField(value, 'passed') };
}
export function numericReceipt(value) {
    record(value);
    return { ...value, distribution: stringField(value, 'distribution'), node_version: stringField(value, 'node_version'),
        imported_module: stringField(value, 'imported_module'), cases: numberField(value, 'cases'), platform_dependent: numberField(value, 'platform_dependent') };
}
export function lifecycleReceipt(value) {
    record(value);
    return { ...value, corePath: stringField(value, 'corePath'), distribution: stringField(value, 'distribution') };
}
export function withoutRootName(text) {
    const value = parseJson(text);
    record(value);
    assert.ok(Array.isArray(value['@graph']), 'Expected metadata graph');
    const root = value['@graph'].find((item) => { record(item); return item['@id'] === './'; });
    record(root);
    delete root.name;
    return value;
}
