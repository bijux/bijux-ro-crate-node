// Generated from tests/reference/blank-node-diagnostics/verify-capture.mts by npm run generate:runtime; do not edit.
import { assertDiagnosticCorrection } from './correction-bounds.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { portableCase } from '../../parity/normalize.mjs';
import { assertInputBytes } from '../../parity/inputs.mjs';
const input = JSON.parse(await readFile(new URL('./inputs.json', import.meta.url), 'utf8'));
const [path, mode, ...extra] = process.argv.slice(2);
assert.ok(path && [undefined, '--corrected'].includes(mode) && !extra.length, 'Expected capture path and optional --corrected');
const expected = JSON.parse(await readFile(new URL(mode ? './corrected.json' : './expected.json', import.meta.url), 'utf8'));
const raw = JSON.parse(await readFile(path, 'utf8'));
assert.equal(raw.corpus_sha256, createHash('sha256').update(JSON.stringify(input.cases)).digest('hex'));
assert.equal(raw.cases.length, input.cases.length);
for (const item of input.cases)
    assertInputBytes(item, raw.cases.find(c => c.name === item.name));
const { imported_module: _module, ...capture } = raw;
const portable = { ...capture, cases: raw.cases.map(portableCase) };
assert.deepEqual(portable, expected);
// The checked-in capture contract supplies diagnostic fields preserved by normalization.
if (mode)
    assertDiagnosticCorrection(JSON.parse(await readFile(new URL('./expected.json', import.meta.url), 'utf8')), portable);
console.log(input.cases.length + ' blank-node diagnostic captures verified');
