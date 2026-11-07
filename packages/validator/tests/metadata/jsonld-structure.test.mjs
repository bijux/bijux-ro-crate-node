import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {makeJSONLDCases} from '../../../../tests/parity/corpus/jsonld.mjs'
import {compareResult} from '../../../../tests/parity/compare.mjs'

const fixture = new URL('../../../../tests/parity/fixtures/test_minimal_valid_ro_crate/', import.meta.url)
const files = Object.fromEntries(await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name =>
  [name, await readFile(new URL(name, fixture), 'utf8')])))
const oracle = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/crates.json', import.meta.url), 'utf8'))

for (const item of makeJSONLDCases({files})) {
  test(item.name + ' preserves independent Python completion and findings', async () => {
    const expected = oracle.cases.find(row => row.name === item.name)
    const actual = await validateCrate(new Map(Object.entries(item.files)))
    compareResult(actual, expected, item.name)
  })
}
