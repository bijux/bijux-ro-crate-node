import test from 'node:test'
import assert from 'node:assert/strict'
import {validateCrate, fromDirectory} from '../../src/index.js'
import {readFile, readdir} from 'node:fs/promises'

test('directory picker preserves crate-relative paths', () => {
  const files = [{webkitRelativePath:'crate/ro-crate-metadata.json'}, {webkitRelativePath:'crate/manifests/list.tsv'}]
  assert.deepEqual([...fromDirectory(files).keys()],['ro-crate-metadata.json','manifests/list.tsv'])
  assert.throws(() => fromDirectory([...files,files[0]]), /Duplicate/)
  assert.throws(() => fromDirectory([{webkitRelativePath:'a/../b'}]), /escapes/)
})

test('untrusted context is blocked without any fetch', async () => {
  const result = await validateCrate(new Map([['ro-crate-metadata.json', '{"@context":"https://unknown.invalid/context","@graph":[]}']]))
  assert.equal(result.status,'incomplete')
})

test('reject undecodable metadata and malformed structure before successful validation', async () => {
  for (const value of [new Uint8Array([0xff]),'{']) {
    const r = await validateCrate(new Map([['ro-crate-metadata.json',value]]))
    assert.equal(r.status,'incomplete')
    assert.equal(r.stage,'input')
  }
})

test('safe validation does not touch unrelated image bytes', async () => {
  const root = new URL('../../../../tests/parity/fixtures/test_minimal_valid_ro_crate/',import.meta.url)
  const files = new Map()
  for (const name of await readdir(root)) files.set(name,await readFile(new URL(name,root)))
  class ImageBlob extends Blob { arrayBuffer() { throw new Error('image was read') } }
  files.set('raw/image1.tiff',new ImageBlob(['pixels']))
  assert.equal((await validateCrate(files)).status,'valid')
})

test('a non-list OWL property-chain declaration retains ordinary reference errors', async () => {
  const root = new URL('../../../../tests/parity/fixtures/test_minimal_valid_ro_crate/',import.meta.url)
  const files = new Map()
  for (const name of await readdir(root)) files.set(name,await readFile(new URL(name,root),'utf8'))
  const doc = JSON.parse(files.get('ro-crate-metadata.json'))
  doc['@context'].push({inference:{'@id':'http://www.w3.org/2002/07/owl#propertyChainAxiom','@type':'@id'}})
  doc['@graph'][0].inference = 'http://example.org/property'
  files.set('ro-crate-metadata.json',JSON.stringify(doc))
  const result = await validateCrate(files)
  assert.equal(result.status,'invalid')
  assert.ok(result.report.issues.ERROR.some(issue => issue.message === 'Found undefined references: http://example.org/property'))
})


test('public validation captures Node Buffers before the first asynchronous read', async () => {
  const root = new URL('../../../../tests/parity/fixtures/test_minimal_valid_ro_crate/', import.meta.url)
  const files = new Map(await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name =>
    [name, await readFile(new URL(name, root))])))
  const pending = validateCrate(files)
  for (const value of files.values()) value.fill(0)
  files.clear()
  assert.equal((await pending).status, 'valid')
})
