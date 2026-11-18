// Generated from tests/reference/model-type-prefixes/verify-capture.mts by npm run generate:runtime; do not edit.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { portableCase } from '../../parity/normalize.mjs';
import { assertCapture } from './checks.mjs';
const [mode, path, ...extra] = process.argv.slice(2);
assert.ok(mode === 'original' && path && !extra.length);
const { imported_module: _module, ...raw } = JSON.parse(await readFile(path, 'utf8'));
raw.cases = raw.cases.map(portableCase);
assertCapture(raw, mode);
console.log('Twenty exact ' + mode + ' model-type prefix records verified');
