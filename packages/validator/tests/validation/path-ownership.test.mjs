import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {makeFilePathCases} from '../../../../tests/inputs/file-paths.mjs'

const fixture = new URL('../../../../tests/parity/fixtures/test_minimal_valid_ro_crate/', import.meta.url)
const files = new Map(await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name =>
  [name, await readFile(new URL(name, fixture), 'utf8')])))

for (const item of makeFilePathCases(files)) test('public validation preserves selected path ownership for ' + item.name, async () => {
  const entries = Object.entries(item.files)
  for (const selected of [new Map(entries), structuredClone(new Map(entries)), new Map(JSON.parse(JSON.stringify(entries)))]) {
    const result = await validateCrate(selected)
    assert.equal(result.status, item.status)
    if (item.status === 'incomplete') {
      assert.equal(result.stage, 'input')
      assert.equal(result.reason, 'Crate path contains an unpaired Unicode surrogate.')
    }
  }
  const native = new Map(entries.map(([name, value]) => {
    const file = new File([value], name)
    return [file.name, file]
  }))
  const uploaded = await validateCrate(native)
  assert.equal(uploaded.status, item.uploadedStatus)
  assert.equal(native.size, item.status === 'incomplete' ? entries.length - 1 : entries.length)
})
