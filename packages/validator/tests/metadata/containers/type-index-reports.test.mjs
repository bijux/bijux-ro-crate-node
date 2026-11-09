import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../../src/index.js'
import {compareResult} from '../../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../../tests/parity/inputs.mjs'
const read = async path => JSON.parse(await readFile(new URL('../../../../../' + path, import.meta.url)))
const cases = []
for (const name of ['type-index-scopes', 'type-map-siblings'])
  cases.push(...(await read('tests/parity/inputs/' + name + '.json')).cases)
const reference = new Map((await read('tests/parity/expected/crates.json')).cases.map(row => [row.name, row]))
for (const item of cases) test(item.name + ' retains its complete independent parser outcome', async () => {
  const expected = reference.get(item.name)
  assert.ok(expected)
  assertInputBytes(item, expected)
  compareResult(await validateCrate(new Map(Object.entries(item.files)),
    {contexts: new Map(Object.entries(item.contexts ?? {}))}), expected, item.name)
})
