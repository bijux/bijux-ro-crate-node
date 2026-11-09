import assert from 'node:assert/strict';
import test from 'node:test';
import {inferColumn, inferChunks} from '../../src/manifest/values.js';
import {numericAlternative, alternateNumericTable} from '../../src/manifest/numeric-identity.js';
import {parseTSV} from '../../src/manifest/tsv.js';

const raw = ['-3019.6136703185655666518e160', '-3.01961367031856573e+163'];
const bits = value => {const data = new DataView(new ArrayBuffer(8)); data.setFloat64(0, value); return data.getBigUint64(0).toString(16).padStart(16, '0');};
test('numeric inference retains both proven C accumulation identities privately', () => {
  const column = inferColumn(raw);
  assert.deepEqual(Object.keys(column).sort(), ['floating', 'kind', 'values']);
  assert.deepEqual(column.values.map(bits), ['e1e0c799395f7162', 'e1e0c799395f7163']);
  assert.deepEqual(numericAlternative(column).map(bits), ['e1e0c799395f7163', 'e1e0c799395f7163']);
  assert.equal(new Set(column.values).size, 2);
  assert.equal(new Set(numericAlternative(column)).size, 1);
});
test('exact integer, string-fallback, zero and non-finite columns have no rounding alternative', () => {
  for (const values of [['1', '2'], ['1.25', '2.5'], ['0.0', '-0.0'], ['inf', '-inf'], ['NaN', 'NA'], [...raw, 'literal']]) {
    assert.equal(numericAlternative(inferColumn(values)), undefined, JSON.stringify(values));
  }
});
test('chunk inference preserves alternatives only for retained numeric values', () => {
  const mixed = inferChunks([raw[0], 'literal'], 524288);
  assert.equal(mixed.kind, 'object');
  assert.deepEqual([...mixed.floatingIndices], [0]);
  assert.equal(bits(numericAlternative(mixed)[0]), 'e1e0c799395f7163');
  assert.equal(numericAlternative(mixed)[1], 'literal');
  const numeric = inferChunks([raw[0], '2'], 524288);
  assert.equal(numeric.kind, 'float');
  assert.equal(bits(numericAlternative(numeric)[0]), 'e1e0c799395f7163');
  assert.equal(numericAlternative(numeric)[1], 2);
});
test('alternate table reconstruction preserves every column and leaves the original untouched', () => {
  const table = parseTSV(`file_path\tdataset\n${raw[0]}\t\n${raw[1]}\t\n`);
  const original = table.rows.map(row => [...row]);
  const alternate = alternateNumericTable(table);
  assert.deepEqual(alternate.names, table.names);
  assert.equal(new Set(alternate.columns.get('file_path').values).size, 1);
  alternate.columns.get('dataset').values = ['changed'];
  alternate.rows[0].set('dataset', 'changed');
  assert.deepEqual(table.rows.map(row => [...row]), original);
  assert.equal(alternateNumericTable(parseTSV('file_path\tdataset\na.tif\t\n')), null);
});
