import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {portableCase} from '../../parity/normalize.mjs';
import {assertInputBytes, type OracleInput, type OracleInputReceipt} from '../../parity/inputs.mjs';
import type {PortableCapture} from '../../parity/normalize.mjs';
type Capture = {imported_module?: unknown; corpus_sha256: unknown; cases: Array<PortableCapture & OracleInputReceipt>; [key: string]: unknown};
const [file, mode, ...extra] = process.argv.slice(2);
assert.ok(file && !extra.length && [undefined, '--corrected', '--trees'].includes(mode), 'Expected capture path and optional --corrected or --trees');
const actual = JSON.parse(await readFile(file, 'utf8')) as unknown;
if (mode === '--trees') {
  assert.deepEqual(actual, JSON.parse(await readFile(new URL('./trees.json', import.meta.url), 'utf8')));
  assert.equal((actual as {capture_sha256: unknown}).capture_sha256, createHash('sha256').update(await readFile(new URL('./capture-trees.py', import.meta.url))).digest('hex'));
} else {
  const input = JSON.parse(await readFile(new URL('./inputs.json', import.meta.url), 'utf8')) as {cases: OracleInput[]};
  assert.equal((actual as Capture).corpus_sha256, createHash('sha256').update(JSON.stringify(input.cases)).digest('hex'));
  assert.deepEqual((actual as Capture).cases.map(row => row.name), input.cases.map(item => item.name));
  for (const item of input.cases) assertInputBytes(item, (actual as Capture).cases.find(row => row.name === item.name)!);
  const {imported_module: _module, ...portable} = actual as Capture;
  portable.cases = (actual as Capture).cases.map(portableCase);
  const expected = JSON.parse(await readFile(new URL(mode === '--corrected' ? './corrected-python.json' : './original-python.json', import.meta.url), 'utf8')) as unknown;
  assert.deepEqual(portable, expected);
}
console.log(mode === '--trees' ? 'Eight HTML tree/error pairs recaptured exactly' : 'Sixteen complete HTML contracts recaptured exactly');
