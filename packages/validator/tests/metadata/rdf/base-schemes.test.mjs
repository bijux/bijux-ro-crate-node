import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'
import {jsonld, jsonldOptions} from '../../../src/metadata/jsonld.js'
import {validateCrate} from '../../../src/index.js'
import {compareResult} from '../../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../../tests/parity/inputs.mjs'

const root = new URL('../../../../../', import.meta.url)
const fixtures = new URL('./fixtures/', import.meta.url)
const capture = JSON.parse(await readFile(new URL('base-schemes.json', fixtures)))
assert.equal(capture.reference.commit, JSON.parse(await readFile(new URL('docs/compatibility/reference.json', root))).commit)
const triples = graph => graph.filter(q => q.graph.termType === 'DefaultGraph')
  .map(q => [q.subject, q.predicate, q.object].map(term => [term.termType, term.value])).sort()

for (const row of capture.cases) test('RDF base scheme keeps its reference constructor and join contract: ' + row.name, async () => {
  const before = structuredClone(row.document), prototype = Object.getOwnPropertyDescriptors(Object.prototype)
  assert.deepEqual(triples(await rdfDataset(row.document)), row.expected)
  assert.deepEqual(row.document, before)
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), prototype)
})

const publicCases = JSON.parse(await readFile(new URL('tests/parity/inputs/rdf-base-schemes.json', root))).cases
const expected = new Map(JSON.parse(await readFile(new URL('tests/parity/expected/crates.json', root))).cases.map(row => [row.name, row]))
for (const row of publicCases) test('complete base-scheme report retains all findings: ' + row.name, async () => {
  const reference = expected.get(row.name)
  assertInputBytes(row, reference)
  const files = new Map(Object.entries(row.files)), before = new Map(files)
  compareResult(await validateCrate(files), reference, row.name)
  assert.deepEqual(files, before)
})

for (const [base, expected] of [
  ['ftp://host/dir/document', 'ftp://host/dir/a//b'],
  ['file:///dir/document', 'file:///dir/a//b'],
  ['ws://host/dir/document', 'ws://host/dir/a//b'],
  ['mailto:opaque/path', 'mailto:opaque/a//b'],
]) test('standard metadata and default JSON-LD retain their base-scheme resolver: ' + base, async () => {
  const document = {'@context': {'@base': base}, '@id': 'a//b', 'urn:p': 'text'}
  for (const options of [{}, jsonldOptions({})]) assert.equal((await jsonld.expand(document, options))[0]['@id'], expected)
})

test('a scheme-aware resolver cannot bypass the selected physical-parent boundary', async () => {
  await assert.rejects(rdfDataset({'@context': {'@base': '../'}, '@id': 'child', 'urn:p': 'text'}), /physical parent directory outside the selected crate/)
})
