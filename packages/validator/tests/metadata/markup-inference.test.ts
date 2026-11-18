import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import type {ReferenceCase, ReferenceExpected} from '../../../../tests/parity/reference-fixtures.js'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'

const input: {cases: ReferenceCase[]} = {cases: []}
for (const name of ['markup-literals', 'html-foreign-content', 'xml-reserved-namespaces'])
  input.cases.push(...JSON.parse(await readFile(new URL('../../../../tests/parity/inputs/' + name + '.json', import.meta.url), 'utf8')).cases)
const oracle: {cases: ReferenceExpected[]} = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/crates.json', import.meta.url), 'utf8'))
for (const item of input.cases) {
  test(item.name + ' preserves collection and OWL restriction outcomes', async () => {
    const expected = oracle.cases.find(c => c.name === item.name)
    assertInputBytes(item, expected!)
    compareResult(await validateCrate(new Map(Object.entries(item.files))), expected!, item.name)
  })
}
