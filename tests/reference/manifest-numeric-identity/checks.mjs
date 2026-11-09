import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assertInputBytes} from '../../parity/inputs.mjs';
import {compareResult} from '../../parity/compare.mjs';

export const {cases} = JSON.parse(await readFile(new URL('./inputs.json', import.meta.url)));
const pinned = JSON.parse(await readFile(new URL('../../../docs/compatibility/reference.json', import.meta.url)));
const provenance = JSON.parse(await readFile(new URL('./arm-provenance.json', import.meta.url)));
const originalBytes = await readFile(new URL('./arm-python.json', import.meta.url));
assert.equal(createHash('sha256').update(originalBytes).digest('hex'), provenance.capture_sha256);
assert.equal(provenance.machine, 'arm64');
export const original = JSON.parse(await readFile(new URL('./arm-python.json', import.meta.url)));
export const python = new Map(original.cases.map(row => [row.name, row]));
export const ambiguous = new Set(['rounded-path-collision', 'rounded-path-diagnostic', 'renamed-path-collision'].map(name => 'numeric-identity/' + name));
export const rejected = new Set(cases.filter(item => ambiguous.has(item.name) || python.get(item.name)?.status !== 'valid').map(item => item.name));
export const suiteHash = createHash('sha256').update(JSON.stringify(cases)).digest('hex');
assert.equal(original.commit, pinned.commit);
assert.equal(original.python, pinned.python);
assert.equal(original.corpus_sha256, suiteHash);
assert.equal(cases.length, python.size);
assert.equal(new Set(cases.map(item => item.name)).size, cases.length);
for (const item of cases) assertInputBytes(item, python.get(item.name));

export function assertNumericResult(item, actual) {
  if (!ambiguous.has(item.name)) {
    compareResult(actual, python.get(item.name), item.name);
    const reasons = new Map([
      ['numeric-identity/scalar-reference-float-interruption', "'float' object is not iterable"],
      ['numeric-identity/numeric-image-type-interruption', 'argument of type is not iterable'],
    ]);
    if (reasons.has(item.name)) {
      assert.equal(actual.stage, 'file-list');
      assert.equal(actual.reason, reasons.get(item.name));
    }
    return;
  }
  assert.deepEqual(actual, {status: 'incomplete', stage: 'file-list',
    reason: 'File list validation depends on platform-specific numeric rounding',
    report: {highest_error_level: null, issues: {CRITICAL: [], ERROR: [], WARNING: [], INFO: [], DEBUG: []}}}, item.name);
}
