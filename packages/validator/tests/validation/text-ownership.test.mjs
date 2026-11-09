import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {makeTextFileCases} from '../../../../tests/inputs/text-files.mjs'

const fixture = new URL('../../../../tests/parity/fixtures/test_minimal_valid_ro_crate/', import.meta.url)
const files = new Map(await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name =>
  [name, await readFile(new URL(name, fixture), 'utf8')])))

for (const item of makeTextFileCases(files)) test('public validation preserves upload semantics for ' + item.name, async () => {
  const selected = new Map(files).set('ro-crate-metadata.json', item.text)
  const result = await validateCrate(selected)
  assert.equal(result.status, item.status)
  if (item.status === 'incomplete') {
    assert.equal(result.stage, 'input')
    assert.equal(result.reason, 'Crate text contains an unpaired Unicode surrogate.')
  }
  const bytes = new TextEncoder().encode(item.text)
  const encoded = await validateCrate(new Map(files).set('ro-crate-metadata.json', bytes))
  const blob = await validateCrate(new Map(files).set('ro-crate-metadata.json', new Blob([item.text])))
  assert.equal(encoded.status, item.encodedStatus)
  assert.deepEqual(blob, encoded)
  if (item.status !== 'incomplete') assert.deepEqual(result, encoded)
  assert.equal(selected.get('ro-crate-metadata.json'), item.text)
})
