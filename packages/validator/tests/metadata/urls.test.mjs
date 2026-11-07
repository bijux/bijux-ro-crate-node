import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {parseURL} from '../../src/metadata/models/urls.js'

const cases = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/url-cases.json', import.meta.url), 'utf8'))
for (const item of cases) {
  test(item.name, () => {
    const errors = []
    const result = parseURL(item.input, [], errors)
    assert.deepEqual(errors, item.expected.errors)
    if (!errors.length) assert.equal(result, item.expected.value)
  })
}
