import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {parseTSV} from '../../src/manifest/tsv.js'

const cases = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/tsv-records.json', import.meta.url)))
for (const item of cases) {
  test('TSV record boundary: ' + JSON.stringify(item.input), () => {
    if (item.expected.error) {
      assert.throws(() => parseTSV(item.input), {message: item.expected.error})
      return
    }
    const table = parseTSV(item.input)
    assert.deepEqual({names: table.names, rows: table.rows.map(row => [...row.values()].map(value => value ?? ''))}, item.expected)
  })
}
