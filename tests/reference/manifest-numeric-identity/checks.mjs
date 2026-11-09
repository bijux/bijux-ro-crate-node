import {registeredInputGuard} from '../runtime/input-ownership.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assertInputBytes} from '../../parity/inputs.mjs';
import {compareResult} from '../../parity/compare.mjs';

export const {cases} = JSON.parse(await readFile(new URL('./inputs.json', import.meta.url)));
const assertRegisteredInput = registeredInputGuard(cases);
const pinned = JSON.parse(await readFile(new URL('../../../docs/compatibility/reference.json', import.meta.url)));
const provenance = JSON.parse(await readFile(new URL('./arm-provenance.json', import.meta.url)));
const originalBytes = await readFile(new URL('./arm-python.json', import.meta.url));
assert.equal(createHash('sha256').update(originalBytes).digest('hex'), provenance.capture_sha256);
assert.equal(provenance.machine, 'arm64');
const capturedOriginal = JSON.parse(await readFile(new URL('./arm-python.json', import.meta.url)));
const capturedRecords = new Map(capturedOriginal.cases.map(row => [row.name, row]));
const declaredAmbiguous = new Set(['rounded-path-collision', 'rounded-path-diagnostic', 'renamed-path-collision'].map(name => 'numeric-identity/' + name));
export const rejected = new Set(cases.filter(item => declaredAmbiguous.has(item.name) || capturedRecords.get(item.name)?.status !== 'valid').map(item => item.name));
export const suiteHash = createHash('sha256').update(JSON.stringify(cases)).digest('hex');
assert.equal(capturedOriginal.commit, pinned.commit);
assert.equal(capturedOriginal.python, pinned.python);
assert.equal(capturedOriginal.corpus_sha256, suiteHash);
assert.equal(cases.length, capturedRecords.size);
assert.equal(new Set(cases.map(item => item.name)).size, cases.length);
for (const item of cases) assertInputBytes(item, capturedRecords.get(item.name));

export function assertNumericResult(item, actual) {
  assertRegisteredInput(item);
  if (!declaredAmbiguous.has(item.name)) {
    compareResult(actual, capturedRecords.get(item.name), item.name);
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

// Inspection snapshots cannot change the private comparison records.
export const original = structuredClone(capturedOriginal);
export const python = structuredClone(capturedRecords);
export const ambiguous = new Set(declaredAmbiguous);
