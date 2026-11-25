// Generated from tests/support/coverage.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
/** Require the actual results to cover one immutable case set exactly once. */
export function verifyCoverage(all, reports, { suite, source, shards }) {
    const names = all.map(item => item.name);
    const digest = createHash('sha256').update(JSON.stringify(all)).digest('hex');
    assert.equal(new Set(names).size, names.length, 'Expected case names repeat');
    assert.equal(reports.length, shards, 'A required shard report is missing or duplicated');
    const indexes = new Set(), executed = [];
    for (const report of reports) {
        const selection = report.selection;
        assert.ok(selection, 'Missing case selection receipt');
        assert.equal(selection.focused_case, undefined, 'Focused runs cannot qualify coverage');
        assert.equal(selection.suite, suite, 'A report belongs to another suite');
        assert.equal(selection.source_sha, source, 'A report belongs to another source');
        assert.equal(selection.case_set_sha256, digest, 'A report belongs to another case set');
        assert.equal(selection.full_case_count, all.length, 'A report omitted expected cases');
        assert.equal(selection.shard.total, shards, 'Shard counts disagree');
        const index = selection.shard.index;
        assert.ok(Number.isInteger(index) && index >= 0 && index < shards, 'Invalid shard index');
        assert.ok(!indexes.has(index), 'A shard index repeats');
        indexes.add(index);
        const expected = names.filter((_, position) => position % shards === index);
        assert.deepEqual(selection.case_names, expected, 'A shard selected the wrong cases');
        assert.deepEqual(report.actual_executed_case_names, expected, 'Actual case execution differs');
        assert.equal(report.total, expected.length, 'A shard has the wrong result count');
        assert.equal(report.passed, expected.length, 'A shard contains a failed case');
        assert.equal(report.failed ?? 0, 0, 'A shard contains a failed case');
        for (const key of ['failures', 'unexpected', 'pageErrors'])
            assert.equal(report[key]?.length ?? 0, 0, 'A shard contains ' + key);
        executed.push(...report.actual_executed_case_names);
    }
    assert.equal(new Set(executed).size, all.length, 'Cases were duplicated or omitted');
    assert.deepEqual([...executed].sort(), [...names].sort(), 'The complete case set was not executed');
    return { suite, source_sha: source, case_set_sha256: digest, cases: all.length, shards };
}
/** Select one whole artifact directory for each expected producer. */
export function selectCoverageAttempts(names, prefix, shards, currentAttempt) {
    assert.ok(Number.isSafeInteger(shards) && shards > 0 && shards <= 64, 'Invalid shard count');
    assert.ok(Number.isSafeInteger(currentAttempt) && currentAttempt > 0, 'Invalid current attempt');
    const browser = prefix !== 'oracle';
    const expected = (browser ? ['chromium', 'firefox', 'webkit'] : ['']).flatMap(engine => Array.from({ length: shards }, (_, shard) => browser ? `${engine}-${shard}` : `${shard}`));
    const selected = new Map();
    const seen = new Set();
    for (const name of names) {
        assert.ok(name.startsWith(prefix + '-'), 'Unexpected coverage artifact: ' + name);
        const rest = name.slice(prefix.length + 1);
        const match = /^(.*)-attempt-([1-9][0-9]*)$/.exec(rest);
        assert.ok(match && expected.includes(match[1]), 'Invalid coverage producer: ' + name);
        const attempt = Number(match[2]);
        assert.ok(Number.isSafeInteger(attempt) && attempt <= currentAttempt, 'Invalid coverage attempt: ' + name);
        const identity = `${match[1]}:${attempt}`;
        assert.ok(!seen.has(identity), 'Duplicate coverage producer attempt: ' + name);
        seen.add(identity);
        if (!selected.has(match[1]) || selected.get(match[1]).attempt < attempt)
            selected.set(match[1], { attempt, name });
    }
    assert.equal(selected.size, expected.length, 'Missing coverage producer');
    return expected.map(key => selected.get(key).name);
}
