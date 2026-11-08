import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {pythonStringRepr, pythonString} from '../../src/manifest/format.js'

const expected = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/manifest-formatting.json', import.meta.url)))
test('manifest string repr matches every pinned Python codepoint', () => {
  const digest = createHash('sha256')
  for (let code = 0; code < 0x110000; code += 1)
    digest.update(pythonStringRepr(String.fromCodePoint(code)) + '\n')
  assert.equal(digest.digest('hex'), expected.string_repr_sha256)
})
test('manifest string-list repr preserves quotes and escapes', () => {
  for (const item of expected.cases) {
    assert.equal(pythonStringRepr(item.input), item.expected)
    assert.equal(pythonString([item.input]), `[${item.expected}]`)
  }
})
