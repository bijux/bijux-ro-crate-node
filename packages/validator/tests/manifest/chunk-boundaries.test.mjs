import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile, readdir} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {makeManifestChunkCases} from '../../../../tests/parity/corpus/manifest-chunks.mjs'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'

const root = new URL('../../../../', import.meta.url)
const directory = new URL('tests/parity/fixtures/test_minimal_valid_ro_crate/', root)
const files = Object.fromEntries(await Promise.all((await readdir(directory))
  .map(async name => [name, await readFile(new URL(name, directory), 'utf8')])))
const expected = new Map(JSON.parse(await readFile(new URL('tests/parity/expected/crates.json', root)))
  .cases.map(row => [row.name, row]))
for (const item of makeManifestChunkCases({files})) {
  test(item.name + ' retains its complete Python report', async () => {
    const wanted = expected.get(item.name)
    assert.ok(wanted)
    assertInputBytes(item, wanted)
    compareResult(await validateCrate(new Map(Object.entries(item.files))), wanted, item.name)
  })
}
