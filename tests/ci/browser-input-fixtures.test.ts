import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {makeFilePathCases} from '../inputs/file-paths.mjs'

test('path fixtures preserve a missing manifest value', async () => {
  const metadata = await readFile(new URL('../parity/fixtures/test_minimal_valid_ro_crate/ro-crate-metadata.json', import.meta.url), 'utf8')
  const cases = makeFilePathCases(new Map([['ro-crate-metadata.json', metadata]]))
  const replacement = cases.find(item => item.name === 'replacement-name')!
  assert.ok(Object.hasOwn(replacement.files, '\ufffd.tsv'))
  assert.equal(replacement.files['\ufffd.tsv'], undefined)
})
