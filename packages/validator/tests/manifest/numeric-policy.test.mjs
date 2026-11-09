import assert from 'node:assert/strict';
import test from 'node:test';
import {cases, assertNumericResult, ambiguous, python} from '../../../../tests/reference/manifest-numeric-identity/checks.mjs';

const empty = () => ({highest_error_level: null, issues: {CRITICAL: [], ERROR: [], WARNING: [], INFO: [], DEBUG: []}});
const interruption = () => ({status: 'incomplete', stage: 'file-list',
  reason: 'File list validation depends on platform-specific numeric rounding', report: empty()});
test('numeric policy permits only the three explicitly characterized portable interruptions', () => {
  assert.equal(ambiguous.size, 3);
  for (const item of cases.filter(item => ambiguous.has(item.name))) {
    assertNumericResult(item, interruption());
    for (const change of [{status: 'valid'}, {stage: 'preflight'}, {reason: 'unknown input'}]) {
      assert.throws(() => assertNumericResult(item, {...interruption(), ...change}), item.name);
    }
    const extra = interruption();
    extra.report.highest_error_level = 'ERROR';
    extra.report.issues.ERROR.push({message: 'Invented numeric rejection', severity: 40, location_description: null});
    assert.throws(() => assertNumericResult(item, extra), item.name);
  }
});
test('agreeing numeric controls keep strict original completion and full reports', () => {
  const item = cases.find(item => item.name.endsWith('/declared-unused-float'));
  const row = python.get(item.name);
  assertNumericResult(item, {status: row.status, report: row.report});
  assert.throws(() => assertNumericResult(item, interruption()));
});
