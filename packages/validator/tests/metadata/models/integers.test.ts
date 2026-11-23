import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import type {ModelIssue} from '../../../src/metadata/models/issues.js'
import {parseInteger} from '../../../src/metadata/models/integers.js'

interface IntegerCase {name: string; input: unknown; expected: {errors: ModelIssue[]; value?: string}}
const cases: IntegerCase[] = JSON.parse(await readFile(new URL('../../../../../tests/parity/expected/integer-cases.json', import.meta.url), 'utf8'))
for (const item of cases) {
  test(item.name, () => {
    const errors: ModelIssue[] = []
    const result = parseInteger(item.input, [], errors)
    assert.deepEqual(errors, item.expected.errors)
    if (!errors.length) assert.equal(String(result), item.expected.value)
  })
}
