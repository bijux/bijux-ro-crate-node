import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {validateCrate} from '../../src/index.js'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'
import type {ReferenceCase, ReferenceExpected} from '../../../../tests/parity/reference-fixtures.js'

type ContextCase = ReferenceCase & {contexts?: Record<string, unknown>}
const read = async (path: string): Promise<unknown> => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
const {cases} = await read('../../../../tests/parity/inputs/context-policy.json') as {cases: ContextCase[]}
const capture = await read('../../../../tests/parity/expected/context-policy.json') as {cases: ReferenceExpected[]; commit: string; corpus_sha256: string}
const reference = await read('../../../../docs/compatibility/reference.json') as {commit: string}
const records = new Map(capture.cases.map(item => [item.name, item]))
assert.equal(capture.commit, reference.commit)
assert.equal(capture.corpus_sha256, createHash('sha256').update(JSON.stringify(cases)).digest('hex'))
assert.equal(records.size, cases.length)

for (const item of cases) test(item.name + ' retains the complete current-main report', async () => {
  const expected = records.get(item.name)
  assertInputBytes(item, expected!)
  const actual = await validateCrate(new Map(Object.entries(item.files)),
    {contexts: new Map(Object.entries(item.contexts ?? {}))})
  compareResult(actual, expected!, item.name)
})
