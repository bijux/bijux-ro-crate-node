// Generated from tests/package/source-contracts.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
export const sourceInputsVersion = 'bijux-source-inputs-1';
function assertBinding(report, node, expected) {
    assert.ok(expected.nodes.includes(node), 'Source qualification requires a pinned Node version');
    assert.equal(report.node_version, node);
    assert.equal(report.distribution, 'source');
    assert.equal(report.imported_module, expected.sourceModule, 'Source qualification imported another validator');
}
export function assertSnapshot(report, node, expected) {
    assertBinding(report, node, expected);
    assert.equal(report.mode, 'snapshot');
    assert.equal(report.reference_kind, 'qualified-main');
    assert.equal(report.reference, expected.reference);
    assert.equal(report.corpus_sha256, expected.corpus);
    const names = expected.names;
    assert.deepEqual(report.selection, { suite: 'crate-parity', source_sha: expected.source,
        case_set_sha256: expected.corpus, full_case_count: names.length,
        shard: { index: 0, total: 1 }, case_names: names });
    assert.deepEqual(report.actual_executed_case_names, names);
    assert.equal(report.total, names.length);
    assert.equal(report.passed, names.length);
    assert.equal(report.ordinary_exact_cases, names.length - 151);
    assert.equal(report.ordinary_exact_passed, names.length - 151);
    assert.equal(report.qualified_collection_cases, 151);
    assert.equal(report.qualified_collection_passed, 151);
    assert.equal(report.failed, 0);
    assert.deepEqual(report.failures, []);
    assert.ok(typeof report.node_executable === 'string' && isAbsolute(report.node_executable));
}
export function assertContract(name, report, node, expected) {
    const suite = expected.suites.find(item => item.name === name);
    assert.ok(suite, 'Unknown source qualification family');
    assertBinding(report, node, expected);
    assert.equal(report.reference, suite.contract.reference.reference);
    assert.equal(report.suite_sha256, suite.contract.reference.suite_sha256);
    assert.equal(report.cases, suite.contract.cases.length);
    assert.deepEqual(report.actual_executed_case_names, suite.contract.cases.map(item => item.name));
    assert.equal(report.approved_differences, suite.contract.approvedDifferences.size);
    if (suite.outcomes) {
        assert.deepEqual(report.outcomes, suite.outcomes);
        assert.equal(report.input_limits, 0);
    }
}
export function assertQualification(report, node, expected) {
    assert.equal(report.inputs_version, sourceInputsVersion, 'Source input inventory version mismatch');
    assert.match(report.inputs_sha256, /^[a-f0-9]{64}$/, 'Invalid source input fingerprint');
    assert.equal(report.inputs_sha256, expected.inputsSha256, 'Source input fingerprint mismatch');
    assert.equal(report.source_sha, expected.source);
    assert.equal(report.node_version, node);
    assertSnapshot(report.snapshot, node, expected);
    assert.deepEqual(report.contracts.map(item => item.suite), expected.suites.map(item => item.name));
    for (const item of report.contracts)
        assertContract(item.suite, item.report, node, expected);
}
export function assertReleaseQualifications(reports, expected) {
    assert.equal(reports.length, expected.releaseNodes.length, 'Expected exactly two source Node qualification receipts');
    assert.deepEqual(reports.map(item => item.node_version).sort(), [...expected.releaseNodes].sort());
    for (const report of reports)
        assertQualification(report, report.node_version, expected);
}
