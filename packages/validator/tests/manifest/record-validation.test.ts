import assert from 'node:assert/strict'
import type {ReferenceCase, ReferenceExpected} from '../../../../tests/parity/reference-fixtures.js'
import test from 'node:test'
import {readFile, readdir} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {makeManifestRecordCases} from '../../../../tests/parity/corpus/manifest-records.mjs'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'

const root = new URL('../../../../', import.meta.url)
const directory = new URL('tests/parity/fixtures/test_minimal_valid_ro_crate/', root)
const files = Object.fromEntries(await Promise.all((await readdir(directory))
  .map(async name => [name, await readFile(new URL(name, directory), 'utf8')])))
const explicit: ReferenceCase[] = []
for (const name of ['manifest-record-replay', 'manifest-token-storage'])
  explicit.push(...JSON.parse(await readFile(new URL(`tests/parity/inputs/${name}.json`, root), 'utf8')).cases)
const cases = [...explicit, ...makeManifestRecordCases({files})]
const expected = new Map<string, ReferenceExpected>((JSON.parse(await readFile(new URL('tests/parity/expected/crates.json', root), 'utf8')) as {cases: ReferenceExpected[]}).cases.map(item => [item.name, item]))
for (const item of cases) {
  test(item.name + ' retains complete parser status and diagnostics', async () => {
    const wanted = expected.get(item.name)
    assert.ok(wanted)
    assertInputBytes(item, wanted)
    compareResult(await validateCrate(new Map(Object.entries(item.files))), wanted, item.name)
  })
}
