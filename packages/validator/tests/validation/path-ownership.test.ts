import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {makeFilePathCases} from '../../../../tests/inputs/file-paths.mjs'
import type {ValidationResult} from '../../src/index.js'

const fixture = new URL('../../../../tests/parity/fixtures/test_minimal_valid_ro_crate/', import.meta.url)
const files = new Map(await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name =>
  [name, await readFile(new URL(name, fixture), 'utf8')] as [string, string])))

for (const item of makeFilePathCases(files)) test('public validation preserves selected path ownership for ' + item.name, async () => {
  const entries = Object.entries(item.files)
  assert.ok(entries.every((entry): entry is [string, string] => typeof entry[1] === 'string'))
  for (const selected of [new Map(entries), structuredClone(new Map(entries)), new Map(JSON.parse(JSON.stringify(entries)) as [string, string][])]) {
    const result = await validateCrate(selected)
    assert.equal(result.status, item.status)
    if (item.status === 'incomplete') {
      assert.equal((result as Extract<ValidationResult, {status: 'incomplete'}>).stage, 'input')
      assert.equal((result as Extract<ValidationResult, {status: 'incomplete'}>).reason, 'Crate path contains an unpaired Unicode surrogate.')
    }
  }
  const native = new Map(entries.map(([name, value]) => {
    const file = new File([value], name)
    return [file.name, file] as [string, File]
  }))
  const uploaded = await validateCrate(native)
  assert.equal(uploaded.status, item.uploadedStatus)
  assert.equal(native.size, item.status === 'incomplete' ? entries.length - 1 : entries.length)
})
