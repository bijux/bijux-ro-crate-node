import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'
import {jsonld, jsonldOptions} from '../../../src/metadata/jsonld.js'
import {validateCrate} from '../../../src/index.js'
import {normalizeReport} from '../../../../../tests/parity/normalize.mjs'

const base = 'https://host/dir/document'
const cases = [
  ['a//b', 'https://host/dir/a/b', 'https://host/dir/a/bchild'],
  ['?#', 'https://host/dir/document#', 'https://host/dir/document#child'],
  ['///host/path', 'https://host/host/path', 'https://host/host/pathchild'],
  ['////host/path', 'https://host//host/path', 'https://host//host/pathchild'],
  ['.;p', 'https://host/dir/;p', 'https://host/dir/;pchild'],
  ['..;p', 'https://host/;p', 'https://host/;pchild'],
]

for (const [reference, expected, prefixed] of cases) for (const role of ['subject', 'object', 'coercion', 'prefix'])
  test('RDF HTTP base preserves the Python path identity of ' + role + ' ' + JSON.stringify(reference), async () => {
    const context = {'@base': base, p: 'urn:p'}
    const document = {'@context': context, '@id': 'urn:root'}
    if (role === 'subject') {document['@id'] = reference; document.p = 'value'}
    else if (role === 'object') document.p = {'@id': reference}
    else if (role === 'coercion') {context.p = {'@id': 'urn:p', '@type': '@id'}; document.p = reference}
    else {context.x = {'@id': reference, '@prefix': true}; document.p = {'@id': 'x:child'}}
    const before = structuredClone(document)
    const [quad] = await rdfDataset(document)
    assert.equal(quad[role === 'subject' ? 'subject' : 'object'].value, role === 'prefix' ? prefixed : expected)
    assert.deepEqual(document, before)
  })

for (const [reference, expected] of [
  ['ordinary', 'https://host/dir/ordinary'], ['a/b', 'https://host/dir/a/b'],
  ['#', 'https://host/dir/document#'], ['?query', 'https://host/dir/document?query'],
  ['/host/path', 'https://host/host/path'], [';p', 'https://host/dir/;p'],
  ['../;p', 'https://host/;p'], ['https://other/a//b', 'https://other/a//b'],
  ['urn:other', 'urn:other'], ['_:blank', 'blank'],
]) test('RDF HTTP base preserves the existing ordinary or absolute identity of ' + JSON.stringify(reference), async () => {
  const [quad] = await rdfDataset({'@context': {'@base': base}, '@id': reference, 'urn:p': 'value'})
  assert.equal(quad.subject.value, expected)
  assert.equal(quad.subject.termType, reference.startsWith('_:') ? 'BlankNode' : 'NamedNode')
})

for (const [context, id, expected] of [
  [[{'@base': base}, {'@base': 'sub/'}], 'a//b', 'https://host/dir/sub/a/b'],
  [[{'@base': base + '?old'}, {'@base': '?'}], '?#', 'https://host/dir/document?old#'],
  [[{'@base': null}, {'@base': 'sub/'}], 'a//b', null],
]) test('RDF HTTP path joining preserves context-base lineage ' + JSON.stringify(context), async () => {
  const document = {'@context': context, '@id': id, 'urn:p': 'value'}
  const before = structuredClone(document)
  assert.deepEqual((await rdfDataset(document)).map(q => q.subject.value), expected === null ? [] : [expected])
  assert.deepEqual(document, before)
})

for (const [id, expected] of [
  ['a//b', 'https://host/dir/a//b'], ['?#', 'https://host/dir/document?#'],
  ['///host/path', 'https:///host/path'], ['////host/path', 'https:////host/path'],
  ['.;p', 'https://host/dir/.;p'], ['..;p', 'https://host/dir/..;p'],
]) test('standard JSON-LD and metadata keep their independent HTTP path resolution for ' + JSON.stringify(id), async () => {
  const document = {'@context': {'@base': base}, '@id': id, 'urn:p': 'value'}
  for (const options of [{}, jsonldOptions({})]) assert.equal((await jsonld.expand(document, options))[0]['@id'], expected)
})

const fixtures = new URL('../../../../../tests/parity/fixtures/test_minimal_valid_ro_crate/', import.meta.url)
for (const [id, expected] of cases) test('complete HTTP-base validation retains the reference diagnostic for ' + JSON.stringify(id), async () => {
  const document = JSON.parse(await readFile(new URL('ro-crate-metadata.json', fixtures), 'utf8'))
  document['@context'].push({'@base': base})
  document['@graph'].push({'@id': id, '@type': 'bia:Publication', title: 'Probe'})
  const files = new Map([['ro-crate-metadata.json', JSON.stringify(document)], ['file_list.tsv', await readFile(new URL('file_list.tsv', fixtures), 'utf8')]])
  const before = new Map(files), result = await validateCrate(files)
  assert.equal(result.status, 'invalid')
  assert.deepEqual(normalizeReport(result.report), normalizeReport({highest_error_level: 'ERROR', issues: {
    CRITICAL: [], WARNING: [], DEBUG: [],
    ERROR: [
      'The RO-Crate metadata file MUST be a CreativeWork, as per schema.org',
      'The RO-Crate metadata file descriptor MUST have an `about` property referencing the Root Data Entity',
      'The RO-Crate metadata file descriptor MUST have a `conformsTo` property with the RO-Crate specification version',
      'The root of the document MUST have an entity with @id `ro-crate-metadata.json`',
    ].map(message => ({message, severity: 40, location_description: 'At ro-crate object with @id: ./ro-crate-metadata.json'})),
    INFO: [{message: 'Found objects in ro-crate-metadata.json with no inbound references: ' + [expected, 'https://host/dir/ro-crate-metadata.json'].sort().join(', '), severity: 20, location_description: null}],
  }}))
  assert.deepEqual(files, before)
})
