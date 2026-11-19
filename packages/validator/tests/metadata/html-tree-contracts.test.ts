import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {htmlLiteral} from '../../src/metadata/rdf/literals/markup/html.js';
import {cases, assertResult, correctedByName, originalByName, approvedDifferences} from '../../../../tests/reference/html-tree-building/checks.mjs';
type Side = 'first' | 'second';
type Pair = {name: string; first: string; second: string};
const trees: {pairs: Array<{name: string; corrected: Record<Side, {canonical: string}>}>} = JSON.parse(await readFile(new URL('../../../../tests/reference/html-tree-building/trees.json', import.meta.url), 'utf8'));
const {pairs}: {pairs: Pair[]} = JSON.parse(await readFile(new URL('../../../../tests/reference/html-tree-building/pairs.json', import.meta.url), 'utf8'));
for (const pair of trees.pairs) for (const side of ['first', 'second'] as const)
  test('qualified HTML tree identity: ' + pair.name + '/' + side, () => {
    const source = pairs.find(item => item.name === pair.name);
    assert.ok(source);
    const input = source[side];
    assert.equal(htmlLiteral(input), pair.corrected[side].canonical);
  });
test('complete grammar reports reject changed outcomes and additional findings', () => {
  for (const item of cases) {
    const expected = correctedByName.get(item.name);
    assert.ok(expected);
    const result = {status: expected.status, report: structuredClone(expected.report)};
    assertResult(item, result);
    assert.throws(() => assertResult(item, {...result, status: result.status === 'valid' ? 'invalid' : 'valid'}));
    const extra = structuredClone(result);
    extra.report.issues.INFO.push({message: 'Unexpected HTML grammar finding', severity: 20, location_description: null});
    extra.report.highest_error_level ??= 'INFO';
    assert.throws(() => assertResult(item, extra));
    if (approvedDifferences.has(item.name)) {
      const original = originalByName.get(item.name);
      assert.ok(original);
      assert.throws(() => assertResult(item, original));
    }
  }
});
test('HTML contracts require their exact input bytes and registered identity', () => {
  const item = cases[0], expected = correctedByName.get(item.name);
  assert.ok(expected);
  assert.throws(() => assertResult({...item, name: 'unregistered'}, expected));
  assert.throws(() => assertResult({...item, files: {...item.files, 'file_list.tsv': 'changed'}}, expected));
});
