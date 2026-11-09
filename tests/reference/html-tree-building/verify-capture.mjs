import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {portableCase} from '../../parity/normalize.mjs';
import {assertInputBytes} from '../../parity/inputs.mjs';
const [file, mode, ...extra] = process.argv.slice(2);
assert.ok(file && !extra.length && [undefined, '--corrected', '--trees'].includes(mode), 'Expected capture path and optional --corrected or --trees');
const actual = JSON.parse(await readFile(file));
if (mode === '--trees') {
  assert.deepEqual(actual, JSON.parse(await readFile(new URL('./trees.json', import.meta.url))));
  assert.equal(actual.capture_sha256, createHash('sha256').update(await readFile(new URL('./capture-trees.py', import.meta.url))).digest('hex'));
} else {
  const input = JSON.parse(await readFile(new URL('./inputs.json', import.meta.url)));
  assert.equal(actual.corpus_sha256, createHash('sha256').update(JSON.stringify(input.cases)).digest('hex'));
  assert.deepEqual(actual.cases.map(row => row.name), input.cases.map(item => item.name));
  for (const item of input.cases) assertInputBytes(item, actual.cases.find(row => row.name === item.name));
  const {imported_module: _module, ...portable} = actual;
  portable.cases = actual.cases.map(portableCase);
  const expected = JSON.parse(await readFile(new URL(mode === '--corrected' ? './corrected-python.json' : './original-python.json', import.meta.url)));
  assert.deepEqual(portable, expected);
}
console.log(mode === '--trees' ? 'Eight HTML tree/error pairs recaptured exactly' : 'Sixteen complete HTML contracts recaptured exactly');
