import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'

const input = JSON.parse(await readFile(new URL('../../../../tests/parity/inputs/markup-literals.json', import.meta.url)))
const oracle = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/crates.json', import.meta.url)))
for (const item of input.cases) {
  test(item.name + ' preserves collection and OWL restriction outcomes', async () => {
    const expected = oracle.cases.find(c => c.name === item.name)
    assertInputBytes(item, expected)
    compareResult(await validateCrate(new Map(Object.entries(item.files))), expected, item.name)
  })
}
