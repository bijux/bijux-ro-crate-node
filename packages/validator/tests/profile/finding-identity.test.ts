import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'
import type {ReferenceCase as ProfileReferenceCase, ReferenceExpected as ProfileReferenceExpected} from '../../../../tests/parity/reference-fixtures.js'

const root = new URL('../../../../', import.meta.url)
const {cases}: {cases: ProfileReferenceCase[]} = JSON.parse(await readFile(new URL('tests/parity/inputs/profile-finding-identity.json', root), 'utf8'))
const oracle: {cases: ProfileReferenceExpected[]} = JSON.parse(await readFile(new URL('tests/parity/expected/crates.json', root), 'utf8'))
for (const item of cases) {
  test(item.name + ' retains distinct RDF values in profile findings', async () => {
    const expected = oracle.cases.find(row => row.name === item.name)
    assertInputBytes(item, expected!)
    compareResult(await validateCrate(new Map(Object.entries(item.files))), expected!, item.name)
  })
}
