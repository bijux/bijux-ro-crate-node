import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {htmlLiteral} from '../../src/metadata/rdf/literals/markup/html.js';
import {cases, assertResult, correctedByName, originalByName, approvedDifferences} from '../../../../tests/reference/html-tree-building/checks.mjs';
const trees = JSON.parse(await readFile(new URL('../../../../tests/reference/html-tree-building/trees.json', import.meta.url)));
const {pairs} = JSON.parse(await readFile(new URL('../../../../tests/reference/html-tree-building/pairs.json', import.meta.url)));
for (const pair of trees.pairs) for (const side of ['first', 'second'])
  test('qualified HTML tree identity: ' + pair.name + '/' + side, () => {
    const input = pairs.find(item => item.name === pair.name)[side];
    assert.equal(htmlLiteral(input), pair.corrected[side].canonical);
  });
test('complete grammar reports reject changed outcomes and additional findings', () => {
  for (const item of cases) {
    const expected = correctedByName.get(item.name), result = {status: expected.status, report: structuredClone(expected.report)};
    assertResult(item, result);
    assert.throws(() => assertResult(item, {...result, status: result.status === 'valid' ? 'invalid' : 'valid'}));
    const extra = structuredClone(result);
    extra.report.issues.INFO.push({message: 'Unexpected HTML grammar finding', severity: 20, location_description: null});
    extra.report.highest_error_level ??= 'INFO';
    assert.throws(() => assertResult(item, extra));
    if (approvedDifferences.has(item.name)) assert.throws(() => assertResult(item, originalByName.get(item.name)));
  }
});
test('HTML contracts require their exact input bytes and registered identity', () => {
  const item = cases[0], expected = correctedByName.get(item.name);
  assert.throws(() => assertResult({...item, name: 'unregistered'}, expected));
  assert.throws(() => assertResult({...item, files: {...item.files, 'file_list.tsv': 'changed'}}, expected));
});
