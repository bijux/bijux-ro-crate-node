import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'
const input = JSON.parse(await readFile(new URL('../../../../tests/reference/converter-failures/inputs.json', import.meta.url)))
const oracle = JSON.parse(await readFile(new URL('../../../../tests/reference/converter-failures/expected.json', import.meta.url)))
for (const item of input.cases) test(item.name + ' preserves required checks when an upstream converter crashes', async () => {
  const expected = oracle.cases.find(c => c.name === item.name)
  assertInputBytes(item, expected)
  assert.equal(expected.status, 'valid', 'Keep the upstream failure explicit')
  assert.deepEqual(expected.report.issues.ERROR, [])
  const actual = await validateCrate(new Map(Object.entries(item.files)))
  assert.equal(actual.status, 'invalid')
  assert.ok(actual.report.issues.ERROR.some(issue => issue.location_description === 'At ro-crate object with @id: ./#unnamed' &&
    issue.message === 'A WebSite MUST have a `name` property'))
  assert.throws(() => compareResult(actual, expected, item.name), /Completion status differs/)
})
