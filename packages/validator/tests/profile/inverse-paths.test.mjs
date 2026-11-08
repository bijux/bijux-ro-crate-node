import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'

const root = new URL('../../../../', import.meta.url)
const input = JSON.parse(await readFile(new URL('tests/parity/inputs/profile-inverse-paths.json', root)))
const expected = new Map(JSON.parse(await readFile(new URL('tests/parity/expected/crates.json', root)))
  .cases.map(item => [item.name, item]))
for (const item of input.cases) {
  test(item.name + ' retains the complete reference finding', async () => {
    const wanted = expected.get(item.name)
    assertInputBytes(item, wanted)
    compareResult(await validateCrate(new Map(Object.entries(item.files))), wanted, item.name)
  })
}
