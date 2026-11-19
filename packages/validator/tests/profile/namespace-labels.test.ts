import type {ReferenceCase, ReferenceExpected} from '../../../../tests/parity/reference-fixtures.js'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'
import {compareResult} from '../../../../tests/parity/compare.mjs'

const root = new URL('../../../../', import.meta.url)
const cases: (ReferenceCase & {contexts?: Record<string, unknown>})[] = JSON.parse(await readFile(new URL('tests/parity/inputs/profile-namespace-labels.json', root), 'utf8')).cases
const expected = new Map<string, ReferenceExpected>((JSON.parse(await readFile(new URL('tests/parity/expected/crates.json', root), 'utf8'))
  .cases as ReferenceExpected[]).map(item => [item.name, item]))
for (const item of cases) {
  test(item.name + ' retains complete namespace diagnostics', async () => {
    const wanted = expected.get(item.name)
    assertInputBytes(item, wanted!)
    compareResult(await validateCrate(new Map(Object.entries(item.files)),
      {contexts: new Map(Object.entries(item.contexts ?? {}))}), wanted!, item.name)
  })
}
