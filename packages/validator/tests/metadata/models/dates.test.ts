import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import type {ModelIssue} from '../../../src/metadata/models/issues.js'
import {parseDate} from '../../../src/metadata/models/dates.js'

interface ScalarCase {name: string; input: unknown; expected: {errors: ModelIssue[]; value?: string}}
const cases: ScalarCase[] = JSON.parse(await readFile(new URL('../../../../../tests/parity/expected/date-cases.json', import.meta.url), 'utf8'))
for (const item of cases) {
  test(item.name, () => {
    const errors: ModelIssue[] = []
    const result = parseDate(item.input, [], errors)
    assert.deepEqual(errors, item.expected.errors)
    if (!errors.length) assert.equal(result, item.expected.value)
  })
}
