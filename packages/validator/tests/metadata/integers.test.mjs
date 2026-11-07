import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {parseInteger} from '../../src/metadata/models/integers.js'

const cases = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/integer-cases.json', import.meta.url), 'utf8'))
for (const item of cases) {
  test(item.name, () => {
    const errors = []
    const result = parseInteger(item.input, [], errors)
    assert.deepEqual(errors, item.expected.errors)
    if (!errors.length) assert.equal(String(result), item.expected.value)
  })
}
