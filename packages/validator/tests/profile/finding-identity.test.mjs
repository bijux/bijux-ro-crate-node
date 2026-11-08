import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'

const root = new URL('../../../../', import.meta.url)
const {cases} = JSON.parse(await readFile(new URL('tests/parity/inputs/profile-finding-identity.json', root)))
const oracle = JSON.parse(await readFile(new URL('tests/parity/expected/crates.json', root)))
for (const item of cases) {
  test(item.name + ' retains distinct RDF values in profile findings', async () => {
    const expected = oracle.cases.find(row => row.name === item.name)
    assertInputBytes(item, expected)
    compareResult(await validateCrate(new Map(Object.entries(item.files))), expected, item.name)
  })
}
