import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'
import type {ReferenceCase, ReferenceExpected} from '../../../../tests/parity/reference-fixtures.js'

const input: {cases: ReferenceCase[]} = JSON.parse(await readFile(new URL('../../../../tests/parity/inputs/calendar-durations.json', import.meta.url), 'utf8'))
const oracle: {cases: ReferenceExpected[]} = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/crates.json', import.meta.url), 'utf8'))
for (const item of input.cases) {
  test(item.name + ' preserves reference calendar identity and parser completion', async () => {
    const expected = oracle.cases.find(c => c.name === item.name)
    assertInputBytes(item, expected!)
    compareResult(await validateCrate(new Map(Object.entries(item.files))), expected!, item.name)
  })
}
