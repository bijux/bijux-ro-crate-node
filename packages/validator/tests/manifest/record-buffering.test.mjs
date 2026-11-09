import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {tokenizeTSVRecords} from '../../src/manifest/records.js'

const root = new URL('../../../../', import.meta.url)
const inputs = JSON.parse(await readFile(new URL('tests/parity/tokenizer/inputs.json', root))).cases
const capture = JSON.parse(await readFile(new URL('tests/parity/expected/tokenizer-records.json', root)))
const reference = JSON.parse(await readFile(new URL('docs/compatibility/reference.json', root)))
assert.equal(capture.reference, reference.commit)
assert.equal(capture.cases.length, inputs.length)
const expected = new Map(capture.cases.map(item => [item.name, item]))
assert.equal(expected.size, inputs.length)
for (const item of inputs) {
  test('pandas record buffering: ' + item.name, () => {
    const text = item.parts.map(part => part.text.repeat(part.repeat ?? 1)).join('')
    const wanted = expected.get(item.name)
    assert.ok(wanted)
    assert.equal(createHash('sha256').update(text).digest('hex'), wanted.input_sha256)
    if (wanted.expected.error) {
      assert.throws(() => tokenizeTSVRecords(text), {message: wanted.expected.error})
      return
    }
    const records = tokenizeTSVRecords(text)
    const names = records.shift().cells.map((name, index) => name || `Unnamed: ${index}`)
    const width = Math.max(names.length, records[0]?.cells.length ?? 0)
    const indexColumns = width - names.length
    const digest = createHash('sha256')
    for (const record of records)
      digest.update(JSON.stringify(record.cells.slice(indexColumns, indexColumns + names.length)) + '\n')
    assert.deepEqual({names, count: records.length, rows_sha256: digest.digest('hex')}, wanted.expected)
  })
}
