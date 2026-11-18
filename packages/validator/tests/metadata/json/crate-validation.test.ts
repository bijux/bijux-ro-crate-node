import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../../src/index.js'
import {compareResult} from '../../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../../tests/parity/inputs.mjs'
import type {ReferenceCase, ReferenceExpected} from '../../../../../tests/parity/reference-fixtures.js'

const cases: ReferenceCase[] = []
for (const name of ['native-json-numbers', 'json-literal-collections', 'native-string-coercion', 'scoped-json-contexts', 'json-constant-identity', 'json-literal-containers', 'json-value-object-types', 'json-native-scalars', 'json-escaped-constants'])
  cases.push(...JSON.parse(await readFile(new URL('../../../../../tests/parity/inputs/' + name + '.json', import.meta.url), 'utf8')).cases)
const oracle: {cases: ReferenceExpected[]} = JSON.parse(await readFile(new URL('../../../../../tests/parity/expected/crates.json', import.meta.url), 'utf8'))
for (const item of cases) {
  test(item.name + ' retains the complete parser outcome for its numeric token', async () => {
    const expected = oracle.cases.find(c => c.name === item.name)
    assertInputBytes(item, expected!)
    compareResult(await validateCrate(new Map(Object.entries(item.files))), expected!, item.name)
  })
}
