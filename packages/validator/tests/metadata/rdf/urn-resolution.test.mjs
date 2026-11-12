import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'
import {jsonld, jsonldOptions} from '../../../src/metadata/jsonld.js'
import {validateCrate} from '../../../src/index.js'
import {normalizeReport} from '../../../../../tests/parity/normalize.mjs'

// Independent pinned RDFLib Graph.parse observations retain URN namespaces.
for (const scheme of ['urn', 'urn-x']) for (const [id, suffix] of [
  ['relative', '/relative'], ['#x', '/#x'], ['#', '/#'], ['?x', '/'],
  ['../child', 'child'], ['../../child', 'child'], ['/root', '/root'],
  ['//host/path', '/path'], ['a/../b', '/b'], ['', '/'],
]) test(`${scheme} context base resolves ${JSON.stringify(id)} with its namespace`, async () => {
  const document = {'@context': {'@base': `${scheme}:base`, p: 'urn:p'}, '@id': id, p: 'text'}
  const before = structuredClone(document)
  const quads = await rdfDataset(document)
  assert.deepEqual(quads.map(q => [q.subject.value, q.predicate.value, q.object.value]),
    [[`${scheme}:base${suffix}`, 'urn:p', 'text']])
  assert.deepEqual(document, before)
})

for (const [id, subject] of [
  ['relative', 'urn:base/dir/relative'], ['?x', 'urn:base/dir/document'],
  ['#x', 'urn:base/dir/document#x'], ['../../child', 'urn:basechild'],
  ['urn:other', 'urn:other'], ['https://host/item', 'https://host/item'],
]) test('URN document path resolves ' + JSON.stringify(id), async () => {
  const document = {'@context': {'@base': 'urn:base/dir/document'}, '@id': id, 'urn:p': 'text'}
  assert.deepEqual((await rdfDataset(document)).map(q => q.subject.value), [subject])
})

for (const id of ['../child', '../../child', '../../../child']) test('URN network-path namespace retains its slash for ' + id, async () => {
  const document = {'@context': {'@base': 'urn:base//double/document'}, '@id': id, 'urn:p': 'text'}
  assert.deepEqual((await rdfDataset(document)).map(q => q.subject.value), ['urn:base//double/child'])
})

for (const [context, subject] of [
  [[{'@base': 'urn:base'}, {'@base': 'dir/'}], 'urn:base/dir/child'],
  [[{'@base': null}, {'@base': 'urn:base'}], 'urn:base/child'],
  [[{'@base': 'urn:base/dir/document'}, {'@base': '../next/'}], 'urn:base/next/child'],
]) test('URN base overrides preserve selected context ' + JSON.stringify(context), async () => {
  const document = {'@context': context, '@id': 'child', 'urn:p': 'text'}
  const before = structuredClone(document)
  assert.deepEqual((await rdfDataset(document)).map(q => q.subject.value), [subject])
  assert.deepEqual(document, before)
})

for (const [name, context, value, object] of [
  ['object identifier', {p: 'urn:p'}, {'@id': 'child'}, 'urn:base/child'],
  ['ID coercion', {p: {'@id': 'urn:p', '@type': '@id'}}, 'child', 'urn:base/child'],
  ['vocabulary coercion', {p: {'@id': 'urn:p', '@type': '@vocab'}}, 'child', 'urn:base/child'],
  ['relative prefix', {p: 'urn:p', x: {'@id': 'sub/', '@prefix': true}}, {'@id': 'x:child'}, 'urn:base/sub/child'],
]) test('URN resolution retains the namespace for ' + name, async () => {
  const document = {'@context': {'@base': 'urn:base', ...context}, '@id': 'urn:subject', p: value}
  assert.deepEqual((await rdfDataset(document)).map(q => [q.subject.value, q.predicate.value, q.object.value]),
    [['urn:subject', 'urn:p', object]])
})

test('URN node scopes and owned prototype keys retain their source object', async () => {
  const document = JSON.parse('{"@context":{"@base":"urn:base","__proto__":"urn:p","child":"urn:child"},"@id":"__proto__","__proto__":"root","child":{"@context":{"@base":"urn:other"},"@id":"constructor","__proto__":"child"}}')
  const before = structuredClone(document), prototype = Object.getOwnPropertyDescriptors(Object.prototype)
  assert.deepEqual((await rdfDataset(document)).map(q => [q.subject.value, q.predicate.value, q.object.value]).sort(), [
    ['urn:base/__proto__', 'urn:p', 'root'],
    ['urn:base/__proto__', 'urn:child', 'urn:other/constructor'],
    ['urn:other/constructor', 'urn:p', 'child'],
  ].sort())
  assert.deepEqual(document, before)
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), prototype)
})

for (const [base, id, subject] of [
  ['https://host/dir/document', 'relative', 'https://host/dir/relative'],
  ['https://host/dir/document', '?x', 'https://host/dir/document?x'],
  ['https://host/dir/document', '#x', 'https://host/dir/document#x'],
  ['urn:base', 'relative', 'urn:relative'], ['urn:base', '#x', 'urn:base#x'],
  ['urn:base', '?x', 'urn:base?x'],
]) test('standard metadata expansion keeps ordinary base resolution for ' + base + ' ' + id, async () => {
  const document = {'@context': {'@base': base}, '@id': id, 'urn:p': 'text'}
  const options = jsonldOptions({})
  assert.equal((await jsonld.expand(document, options))[0]['@id'], subject)
  assert.equal((await jsonld.expand(document))[0]['@id'], subject)
  if (base.startsWith('https:')) assert.equal((await rdfDataset(document))[0].subject.value, subject)
})

const fixtureRoot = new URL('../../../../../tests/parity/fixtures/test_minimal_valid_ro_crate/', import.meta.url)
for (const scheme of ['urn', 'urn-x']) test(scheme + ' context base preserves the complete pre-parse report', async () => {
  const document = JSON.parse(await readFile(new URL('ro-crate-metadata.json', fixtureRoot), 'utf8'))
  document['@context'].push({'@base': scheme + ':base'})
  const files = new Map([['ro-crate-metadata.json', JSON.stringify(document)],
    ['file_list.tsv', await readFile(new URL('file_list.tsv', fixtureRoot), 'utf8')]])
  const before = new Map(files)
  const result = await validateCrate(files)
  assert.equal(result.status, 'invalid')
  assert.deepEqual(normalizeReport(result.report), normalizeReport({highest_error_level: 'ERROR', issues: {
    CRITICAL: [], WARNING: [], DEBUG: [],
    ERROR: [
      'The RO-Crate metadata file MUST be a CreativeWork, as per schema.org',
      'The RO-Crate metadata file descriptor MUST have an `about` property referencing the Root Data Entity',
      'The RO-Crate metadata file descriptor MUST have a `conformsTo` property with the RO-Crate specification version',
      'The root of the document MUST have an entity with @id `ro-crate-metadata.json`',
    ].map(message => ({message, severity: 40, location_description: 'At ro-crate object with @id: ./ro-crate-metadata.json'})),
    INFO: [{message: `Found objects in ro-crate-metadata.json with no inbound references: ${scheme}:base/ro-crate-metadata.json`, severity: 20, location_description: null}],
  }}))
  assert.deepEqual(files, before)
})
