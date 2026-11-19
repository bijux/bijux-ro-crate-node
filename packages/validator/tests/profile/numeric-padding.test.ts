import type {ReferenceCase, ReferenceExpected} from '../../../../tests/parity/reference-fixtures.js'
import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'
import {compareResult} from '../../../../tests/parity/compare.mjs'

const root = new URL('../../../../', import.meta.url)
const {cases}: {cases: ReferenceCase[]} = JSON.parse(await readFile(new URL('tests/parity/inputs/datatype-numeric-padding.json', root), 'utf8'))
const expected = new Map<string, ReferenceExpected>((JSON.parse(await readFile(new URL('tests/parity/expected/crates.json', root), 'utf8')).cases as ReferenceExpected[]).map(x => [x.name, x]))
for (const item of cases) test(item.name + ' preserves its complete Python outcome', async () => {
  const wanted = expected.get(item.name)
  assert.ok(wanted)
  assertInputBytes(item, wanted)
  compareResult(await validateCrate(new Map(Object.entries(item.files))), wanted, item.name)
})
