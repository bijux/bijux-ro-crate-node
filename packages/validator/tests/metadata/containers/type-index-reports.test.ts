import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../../src/index.js'
import {compareResult} from '../../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../../tests/parity/inputs.mjs'
import type {ReferenceCase, ReferenceExpected} from '../../../../../tests/parity/reference-fixtures.js'
const read = async (path: string): Promise<unknown> => JSON.parse(await readFile(new URL('../../../../../' + path, import.meta.url), 'utf8'))
const cases: Array<ReferenceCase & {contexts?: Record<string, unknown>}> = []
for (const name of ['type-index-scopes', 'type-map-siblings'])
  cases.push(...(await read('tests/parity/inputs/' + name + '.json') as {cases: typeof cases}).cases)
const reference = new Map((await read('tests/parity/expected/crates.json') as {cases: ReferenceExpected[]}).cases.map(row => [row.name, row]))
for (const item of cases) test(item.name + ' retains its complete independent parser outcome', async () => {
  const expected = reference.get(item.name)
  assert.ok(expected)
  assertInputBytes(item, expected)
  compareResult(await validateCrate(new Map(Object.entries(item.files)),
    {contexts: new Map(Object.entries(item.contexts ?? {}))}), expected, item.name)
})
