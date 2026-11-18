import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import type {ReferenceCase as ManifestReferenceCase, ReferenceExpected as ManifestReferenceExpected} from '../../../../tests/parity/reference-fixtures.js'

const root = new URL('../../../../', import.meta.url)
const cases: ManifestReferenceCase[] = JSON.parse(await readFile(new URL('tests/parity/inputs/manifest-column-joins.json', root), 'utf8')).cases
const expected = new Map<string, ManifestReferenceExpected>((JSON.parse(await readFile(new URL('tests/parity/expected/crates.json', root), 'utf8')) as {cases: ManifestReferenceExpected[]})
  .cases.map(item => [item.name, item]))
for (const item of cases) {
  test(item.name + ' retains post-expansion reference lookup completion', async () => {
    const wanted = expected.get(item.name)
    assertInputBytes(item, wanted!)
    compareResult(await validateCrate(new Map(Object.entries(item.files))), wanted!, item.name)
  })
}
