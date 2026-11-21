// Generated from scripts/ci/reference-receipts.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReferencePlan } from '../reference/plan.mjs';
export function combineReferenceReceipts(plan, parts, final) {
    assert.equal(parts.length, 4, 'Expected four upstream family receipts');
    const completed = new Map();
    for (const [index, receipt] of parts.entries()) {
        const group = `upstream-families-${index}`;
        const expected = plan.referenceGroups[group];
        assert.equal(receipt.group, group);
        assert.equal(receipt.passed, expected.length);
        assert.equal(receipt.commands.length, expected.length);
        for (const [position, command] of receipt.commands.entries()) {
            const { seconds, status, ...actual } = command;
            assert.ok(Number.isFinite(seconds) && seconds >= 0 && status === 0, 'Reference command did not pass');
            assert.deepEqual(actual, expected[position], 'Family receipt differs from the pinned plan');
            const identity = JSON.stringify(actual);
            assert.ok(!completed.has(identity), 'Duplicate reference command receipt');
            completed.set(identity, command);
        }
    }
    assert.equal(final.group, 'upstream-defects-validation');
    assert.equal(final.passed, 1);
    assert.equal(final.commands.length, 1);
    const { seconds, status, ...actual } = final.commands[0];
    assert.ok(Number.isFinite(seconds) && seconds >= 0 && status === 0, 'Reference validation did not pass');
    assert.deepEqual(actual, plan.referenceGroups['upstream-defects-validation'][0]);
    const expected = plan.referenceGroups['upstream-defects'];
    const commands = expected.slice(0, -1).map(command => {
        const found = completed.get(JSON.stringify(command));
        assert.ok(found, 'Missing reference command receipt');
        return found;
    });
    assert.equal(commands.length, completed.size, 'Unexpected reference command receipt');
    commands.push(final.commands[0]);
    return { group: 'upstream-defects', passed: commands.length, commands };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const report = (group) => resolve('artifacts/reports', `reference-checks-${group}.json`);
    const read = async (group) => JSON.parse(await readFile(report(group), 'utf8'));
    const parts = await Promise.all(Array.from({ length: 4 }, (_, index) => read(`upstream-families-${index}`)));
    const final = await read('upstream-defects-validation');
    const plan = createReferencePlan({ python: process.env.BIA_PYTHON ?? 'artifacts/reference/python-env/bin/python', nodeExecutable: process.execPath });
    await writeFile(report('upstream-defects'), JSON.stringify(combineReferenceReceipts(plan, parts, final), null, 2) + '\n');
}
