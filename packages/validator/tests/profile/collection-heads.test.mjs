import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {compareResult} from '../../../../tests/parity/compare.mjs'

const inputs = JSON.parse(await readFile(new URL('../../../../tests/parity/inputs/profile-collection-heads.json', import.meta.url)))
const expected = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/crates.json', import.meta.url)))
for (const item of inputs.cases) test(item.name, async () => {
  const wanted = expected.cases.find(value => value.name === item.name)
  assert.ok(wanted, 'Missing independent Python expectation')
  const actual = await validateCrate(new Map(Object.entries(item.files)))
  compareResult(actual, wanted, item.name)
})
