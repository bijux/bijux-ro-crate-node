import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../../src/index.js'
import {compareResult} from '../../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../../tests/parity/inputs.mjs'

const cases = []
for (const name of ['native-json-numbers', 'json-literal-collections', 'native-string-coercion', 'scoped-json-contexts', 'json-constant-identity', 'json-literal-containers', 'json-value-object-types'])
  cases.push(...JSON.parse(await readFile(new URL('../../../../../tests/parity/inputs/' + name + '.json', import.meta.url))).cases)
const oracle = JSON.parse(await readFile(new URL('../../../../../tests/parity/expected/crates.json', import.meta.url)))
for (const item of cases) {
  test(item.name + ' retains the complete parser outcome for its numeric token', async () => {
    const expected = oracle.cases.find(c => c.name === item.name)
    assertInputBytes(item, expected)
    compareResult(await validateCrate(new Map(Object.entries(item.files))), expected, item.name)
  })
}
