import assert from 'node:assert/strict'
import test from 'node:test'
import {parseTSV} from '../../packages/validator/src/manifest/tsv.js'

test('TSV parsing preserves quoted tabs, newlines and escaped quotes', () => {
  const table = parseTSV('path\tnote\r\n"image\tname.tif"\t"line one\nline ""two"""\r\n')

  assert.deepEqual(table.names, ['path', 'note'])
  assert.deepEqual([...table.rows[0]], [
    ['path', 'image\tname.tif'],
    ['note', 'line one\nline "two"']
  ])
})

test('TSV inference retains booleans, missing cells and exact unsigned integers', () => {
  const table = parseTSV('flag\tcount\tidentifier\nTrue\t1\t18446744073709551614\nfalse\t"NA"\t18446744073709551615\n')

  assert.deepEqual(table.columns.get('flag').values, [true, false])
  assert.deepEqual(table.columns.get('count').values, [1, null])
  assert.equal(table.columns.get('count').floating, true)
  assert.deepEqual(table.columns.get('identifier').values, [18446744073709551614n, 18446744073709551615n])
})

test('TSV duplicate headers are disambiguated while typed duplicate values coincide', () => {
  const table = parseTSV('path\tpath\tpath.1\n"01"\ta\tb\n1\tc\td\n')

  assert.deepEqual(table.names, ['path', 'path.2', 'path.1'])
  assert.deepEqual(table.columns.get('path').values, [1, 1])
  assert.deepEqual(table.columns.get('path.2').values, ['a', 'c'])
  assert.deepEqual(table.columns.get('path.1').values, ['b', 'd'])
})

test('TSV parsing reports unterminated quotes and overflowing records', () => {
  assert.throws(() => parseTSV('path\tdataset\n"image.tif\t#dataset\n'),
    /EOF inside string starting at row 1/)
  assert.throws(() => parseTSV('path\tdataset\na\t#dataset\nb\t#dataset\textra\n'),
    /Expected 2 fields in line 3, saw 3/)
})
