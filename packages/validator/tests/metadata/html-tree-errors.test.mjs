import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {htmlLiteral} from '../../src/metadata/rdf/literals/markup/html.js';
import {parseHTMLFragment} from '../../src/metadata/rdf/literals/markup/html-parser.js';
const input = await readFile(new URL('../../../../tests/parity/html/tree-errors.json', import.meta.url));
const capture = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/html-tree-errors.json', import.meta.url)));
assert.equal(capture.input_sha256, createHash('sha256').update(input).digest('hex'));
for (const item of capture.values) test('strict HTML identity: ' + JSON.stringify(item.input), () => {
  assert.equal(htmlLiteral(item.input), item.canonical);
});
for (const text of ['<h1><h1>x</h1>', '<h1><p><h2>x</h2>', '<nobr><nobr>x</nobr>'])
  test('strict tree repair preserves lexical fallback: ' + text, () => assert.throws(() => parseHTMLFragment(text)));
