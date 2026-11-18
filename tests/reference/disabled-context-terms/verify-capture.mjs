// Generated from tests/reference/disabled-context-terms/verify-capture.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { portableCase } from '../../parity/normalize.mjs';
import { assertInputBytes } from '../../parity/inputs.mjs';
const [path, ...extra] = process.argv.slice(2);
assert.ok(path && !extra.length, 'Expected an original Python capture path');
const { cases } = JSON.parse(await readFile(new URL('./inputs.json', import.meta.url), 'utf8'));
const expected = JSON.parse(await readFile(new URL('./python.json', import.meta.url), 'utf8'));
const raw = JSON.parse(await readFile(path, 'utf8'));
assert.equal(raw.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'));
for (const item of cases)
    assertInputBytes(item, raw.cases.find(row => row.name === item.name));
const { imported_module: _module, ...portable } = raw;
portable.cases = raw.cases.map(portableCase);
assert.deepEqual(portable, expected);
console.log(cases.length + ' disabled context term captures verified');
