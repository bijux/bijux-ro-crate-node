import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {makeOntologyCases} from '../../../../tests/parity/corpus/ontology.mjs'
import {compareResult} from '../../../../tests/parity/compare.mjs'

const fixture = new URL('../../../../tests/parity/fixtures/test_minimal_valid_ro_crate/', import.meta.url)
const files = Object.fromEntries(await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name =>
  [name, await readFile(new URL(name, fixture), 'utf8')])))
const oracle = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/crates.json', import.meta.url), 'utf8'))

for (const item of makeOntologyCases({files})) {
  test(item.name + ' matches the independent complete parser', async () => {
    compareResult(await validateCrate(new Map(Object.entries(item.files))),
      oracle.cases.find(row => row.name === item.name), item.name)
  })
}
