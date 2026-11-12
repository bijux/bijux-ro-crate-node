import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {validateCrate} from '../../src/index.js'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url)))
const {cases} = await read('../../../../tests/parity/inputs/context-policy.json')
const capture = await read('../../../../tests/parity/expected/context-policy.json')
const reference = await read('../../../../docs/compatibility/reference.json')
const records = new Map(capture.cases.map(item => [item.name, item]))
assert.equal(capture.commit, reference.commit)
assert.equal(capture.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
assert.equal(records.size, cases.length)

for (const item of cases) test(item.name + ' retains the complete current-main report', async () => {
  const expected = records.get(item.name)
  assertInputBytes(item, expected)
  const actual = await validateCrate(new Map(Object.entries(item.files)),
    {contexts: new Map(Object.entries(item.contexts ?? {}))})
  compareResult(actual, expected, item.name)
})
