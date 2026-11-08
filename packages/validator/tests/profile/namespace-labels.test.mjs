import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'
import {compareResult} from '../../../../tests/parity/compare.mjs'

const root = new URL('../../../../', import.meta.url)
const cases = JSON.parse(await readFile(new URL('tests/parity/inputs/profile-namespace-labels.json', root))).cases
const expected = new Map(JSON.parse(await readFile(new URL('tests/parity/expected/crates.json', root)))
  .cases.map(item => [item.name, item]))
for (const item of cases) {
  test(item.name + ' retains complete namespace diagnostics', async () => {
    const wanted = expected.get(item.name)
    assertInputBytes(item, wanted)
    compareResult(await validateCrate(new Map(Object.entries(item.files)),
      {contexts: new Map(Object.entries(item.contexts ?? {}))}), wanted, item.name)
  })
}
