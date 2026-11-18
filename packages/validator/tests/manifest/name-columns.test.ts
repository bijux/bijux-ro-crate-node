import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import type {ManifestReferenceCase, ManifestReferenceExpected} from './reference-fixtures.js'

const root = new URL('../../../../', import.meta.url)
const cases: ManifestReferenceCase[] = JSON.parse(await readFile(new URL('tests/parity/inputs/manifest-name-columns.json', root)) as unknown as string).cases
const expected = new Map<string, ManifestReferenceExpected>((JSON.parse(await readFile(new URL('tests/parity/expected/crates.json', root)) as unknown as string) as {cases: ManifestReferenceExpected[]})
  .cases.map(item => [item.name, item]))
for (const item of cases) {
  test(item.name + ' uses optional name values only when declared', async () => {
    const wanted = expected.get(item.name)
    assertInputBytes(item, wanted!)
    compareResult(await validateCrate(new Map(Object.entries(item.files))), wanted!, item.name)
  })
}
