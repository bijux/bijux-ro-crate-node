// Generated from scripts/ci/require-jobs.mts by npm run generate:admission; do not edit.
import assert from 'node:assert/strict';
const jobs = JSON.parse(process.env.BIJUX_REQUIRED_JOBS ?? '{}');
assert.ok(Object.keys(jobs).length, 'An aggregate gate must depend on required jobs');
if (process.env.BIJUX_EXPECTED_JOBS !== undefined) {
    const expected = JSON.parse(process.env.BIJUX_EXPECTED_JOBS);
    assert.ok(Array.isArray(expected) && expected.length > 0 && expected.every(name => typeof name === 'string' && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)), 'Expected job names must be a nonempty array');
    assert.equal(new Set(expected).size, expected.length, 'Expected job names must be unique');
    assert.deepEqual(Object.keys(jobs).sort(), [...expected].sort(), 'Required job set does not match');
}
for (const [name, job] of Object.entries(jobs))
    assert.equal(job.result, 'success', 'Required job did not succeed: ' + name);
console.log('All required job groups succeeded');
