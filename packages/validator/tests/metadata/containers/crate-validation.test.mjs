import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../../src/index.js'
import {compareResult} from '../../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../../tests/parity/inputs.mjs'

const root = new URL('../../../../../', import.meta.url)
const {cases} = JSON.parse(await readFile(new URL('tests/parity/inputs/jsonld-containers.json', root)))
const oracle = JSON.parse(await readFile(new URL('tests/parity/expected/crates.json', root)))
const expected = new Map(oracle.cases.map(item => [item.name, item]))
assert.equal(cases.length, 28)
for (const item of cases) test(item.name + ' preserves the complete unchanged reference report', async () => {
  assertInputBytes(item, expected.get(item.name))
  compareResult(await validateCrate(new Map(Object.entries(item.files)),
    {contexts: new Map(Object.entries(item.contexts ?? {}))}), expected.get(item.name), item.name)
})
