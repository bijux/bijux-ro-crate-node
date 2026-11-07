import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {inferColumn} from '../../src/manifest/values.js'

const cases = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/manifest-values.json', import.meta.url), 'utf8'))
for (const item of cases) {
  test('pandas column: ' + item.name, () => {
    const actual = inferColumn(item.input)
    assert.equal(actual.kind, item.expected.kind)
    assert.equal(actual.floating, item.expected.kind === 'float')
    assert.equal(actual.values.length, item.expected.values.length)
    for (const [index, expected] of item.expected.values.entries()) {
      const value = actual.values[index]
      if (expected.type === 'missing') assert.equal(value, null)
      else if (expected.type === 'integer') assert.equal(String(value), expected.value)
      else if (expected.type === 'float') {
        const wanted = expected.value === 'inf' ? Infinity : expected.value === '-inf' ? -Infinity : Number(expected.value)
        assert.equal(value, wanted)
      } else assert.equal(value, expected.value)
    }
  })
}
