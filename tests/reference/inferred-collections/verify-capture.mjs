// Generated from tests/reference/inferred-collections/verify-capture.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { portableCase } from '../../parity/normalize.mjs';
import { assertInputBytes } from '../../parity/inputs.mjs';
import { assertCaptureRecord } from './capture-records.mjs';
const [mode, path, ...extra] = process.argv.slice(2);
assert.ok(['original', 'corrected'].includes(mode) && path && (extra.length === 0 ||
    (mode === 'original' && extra.length === 2 && extra[0] === '--receipt')), 'Expected original/corrected and a fresh Python capture');
const all = JSON.parse(await readFile(new URL('./inputs.json', import.meta.url), 'utf8')).cases;
const cases = all;
const expected = JSON.parse(await readFile(new URL('./' + mode + '.json', import.meta.url), 'utf8'));
const bytes = await readFile(path);
if (extra.length) {
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    const receipt = JSON.parse(await readFile(extra[1], 'utf8'));
    const hash = (value) => createHash('sha256').update(value).digest('hex');
    assert.equal(receipt.source, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), 'Reference receipt source differs');
    assert.equal(receipt.scheduler_sha256, hash(await readFile(resolve(root, 'scripts/reference/execution.mjs'))), 'Reference scheduler differs');
    assert.equal(receipt.owner_sha256, hash(await readFile(resolve(root, 'scripts/reference/process-owner.mjs'))), 'Reference owner differs');
    assert.equal(receipt.output_sha256, hash(bytes), 'Reference capture bytes differ');
}
const raw = JSON.parse(bytes.toString('utf8'));
assert.equal(raw.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'));
assert.deepEqual(raw.cases.map(row => row.name), cases.map(item => item.name));
for (const item of cases)
    assertInputBytes(item, raw.cases.find(row => row.name === item.name));
const { imported_module: _module, ...capture } = raw;
const portable = { ...capture, cases: raw.cases.map(portableCase) };
assert.deepEqual({ ...portable, cases: [] }, { ...expected, cases: [] });
// The capture contract supplies the exception and receipt fields preserved by normalization.
for (const [index, row] of portable.cases.entries())
    assertCaptureRecord(row, expected.cases[index]);
console.log(cases.length + ' ' + mode + ' collection captures verified');
