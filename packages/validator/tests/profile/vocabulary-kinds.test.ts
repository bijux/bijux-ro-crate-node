import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'
import type {ProfileReferenceCase, ProfileReferenceExpected} from './reference-fixtures.js'

const input: {cases: ProfileReferenceCase[]} = JSON.parse(await readFile(new URL('../../../../tests/parity/inputs/profile-vocabulary-kinds.json', import.meta.url)) as unknown as string)
const oracle: {cases: ProfileReferenceExpected[]} = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/crates.json', import.meta.url)) as unknown as string)
for (const item of input.cases) {
  test(item.name + ' matches vocabulary terms by RDF kind through the profile', async () => {
    const expected = oracle.cases.find(c => c.name === item.name)
    assertInputBytes(item, expected!)
    compareResult(await validateCrate(new Map(Object.entries(item.files))), expected!, item.name)
  })
}
