// Generated from tests/package/validator/guard-selection.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
export function selectInstalledGuardGroups(groups, lane) {
    assert.equal(groups.length, 3, 'Expected three installed guard groups');
    assert.ok(lane === undefined || ['references', 'sessions', 'inputs'].includes(lane), 'Invalid installed guard partition');
    return lane === undefined ? groups : [groups[['references', 'sessions', 'inputs'].indexOf(lane)]];
}
