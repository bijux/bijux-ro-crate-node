import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'
import type {ReferenceCase as ManifestReferenceCase, ReferenceExpected as ManifestReferenceExpected} from '../../../../tests/parity/reference-fixtures.js'

const input: {cases: ManifestReferenceCase[]} = JSON.parse(await readFile(new URL('../../../../tests/parity/inputs/manifest-tokenization.json', import.meta.url), 'utf8'))
const oracle: {cases: ManifestReferenceExpected[]} = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/crates.json', import.meta.url), 'utf8'))
for (const item of input.cases) {
  test(item.name + ' retains manifest inference and the complete parser report', async () => {
    const expected = oracle.cases.find(c => c.name === item.name)
    assertInputBytes(item, expected!)
    compareResult(await validateCrate(new Map(Object.entries(item.files))), expected!, item.name)
  })
}
