import assert from 'node:assert/strict'
import {test} from 'node:test'
import * as creator from '../../src/index.js'

const descriptor = `{
  "@context": ["https://w3id.org/ro/crate/1.1/context", {"bia":"http://bia/"}],
  "@graph": [
    {"@id":"ro-crate-metadata.json","@type":"CreativeWork","conformsTo":{"@id":"https://w3id.org/ro/crate/1.1"},"about":{"@id":"./"}},
    {"@id":"./","@type":["Dataset","bia:Study"],"name":"Original","custom":{"@id":"#entity-1"},"count":42,"extra":["a","b"]},
    {"@id":"#entity-1","@type":"bia:Unknown","payload":"preserved"}
  ]
}\n`
test('import preserves original files and patches only the changed field', async () => {
  assert.equal(typeof creator.importCrate, 'function')
  const bytes = new TextEncoder().encode(descriptor)
  const source = new Map([['ro-crate-metadata.json', bytes], ['notes.json', new TextEncoder().encode('{"notes":true}')], ['image.tif', new Uint8Array([1, 2, 3])]])
  const result = await creator.importCrate(source, {metadataPaths: ['ro-crate-metadata.json', 'notes.json']})
  assert.equal(result.status, 'editable')
  if (result.status !== 'editable') return
  assert.deepEqual(result.excludedPaths, ['image.tif'])
  bytes.fill(0)
  const original = creator.materializeDraft(result.draft)
  if (original.status !== 'materialized') throw Error('materialization blocked')
  assert.deepEqual(original.files.get('ro-crate-metadata.json'), new TextEncoder().encode(descriptor))
  const changed = creator.applyChange(result.draft, {type: 'set-field', entityId: './', field: 'name', value: 'Changed'})
  if (changed.status !== 'applied') throw Error('edit rejected')
  const exported = creator.materializeDraft(changed.draft)
  if (exported.status !== 'materialized') throw Error('materialization blocked')
  const actual = JSON.parse(new TextDecoder().decode(exported.files.get('ro-crate-metadata.json') as Uint8Array))
  assert.deepEqual(actual['@graph'][1], {'@id':'./','@type':['Dataset','bia:Study'],name:'Changed',custom:{'@id':'#entity-1'},count:42,extra:['a','b']})
  assert.deepEqual(actual['@graph'][2], {'@id':'#entity-1','@type':'bia:Unknown',payload:'preserved'})
  assert.deepEqual(exported.files.get('notes.json'), new TextEncoder().encode('{"notes":true}'))
  const added = creator.applyChange(changed.draft, {type: 'add-entity', kind:'biosample'})
  if (added.status !== 'applied') throw Error('entity rejected')
  assert.notEqual(added.entityId, '#entity-1')
})

test('unsafe JSON and unsupported contexts remain recoverable, limits and paths reject adoption', async () => {
  const inputs = [descriptor.replace('"count":42', '"count":9007199254740993'), descriptor.replace('"count":42', '"count":1.0'), descriptor.replace('"count":42', '"count":-0'), descriptor.replace('"name":"Original"', '"name":"Original","na\\u006de":"Duplicate"'), descriptor.replace('"bia":"http://bia/"', '"bia":"https://unsupported/"')]
  for (const text of inputs) {
    const result = await creator.importCrate(new Map([['ro-crate-metadata.json', text]]), {metadataPaths:['ro-crate-metadata.json']})
    assert.equal(result.status, 'read-only')
    if (result.status === 'read-only') assert.deepEqual(result.files.get('ro-crate-metadata.json'), new TextEncoder().encode(text))
  }
  const big = await creator.importCrate(new Map([['ro-crate-metadata.json', descriptor]]), {metadataPaths:['ro-crate-metadata.json'], maxBytes: 10})
  assert.equal(big.status, 'rejected')
  const unsafe = await creator.importCrate(new Map([['../ro-crate-metadata.json', descriptor]]), {metadataPaths:['../ro-crate-metadata.json']})
  assert.equal(unsafe.status, 'rejected')
})

test('manifest import preserves unknown columns through an edit', async () => {
  let draft = creator.createDraft()
  const step = (change: creator.DraftChange) => {const result = creator.applyChange(draft, change); if (result.status !== 'applied') throw Error('setup failed'); draft = result.draft; return result.entityId}
  step({type:'add-study'})
  const specimen = step({type:'add-entity', kind:'specimen'})
  const dataset = step({type:'add-entity', kind:'dataset'})
  step({type:'add-file', file:{path:'image.tif', size:'10', datasetId:dataset, specimenId:specimen, type:'image'}})
  const generated = creator.materializeDraft(draft)
  if (generated.status !== 'materialized') throw Error('setup failed')
  const graph = JSON.parse(generated.files.get('ro-crate-metadata.json') as string)
  const schema = graph['@graph'].find((node: Record<string, unknown>) => node['@id'] === '#file-list-schema')
  schema.column.push({'@id':'#extra-column'})
  graph['@graph'].push({'@id':'#extra-column','@type':['csvw:Column'],columnName:'notes',propertyUrl:'http://example.org/note'})
  const table = (generated.files.get('file_list.tsv') as string).replace(/\n$/, '').split('\n').map((line, index) => line + (index ? '\tretained' : '\tnotes')).join('\n') + '\n'
  const metadata = JSON.stringify(graph)
  const imported = await creator.importCrate(new Map([['ro-crate-metadata.json', metadata], ['file_list.tsv', table]]), {metadataPaths:['ro-crate-metadata.json','file_list.tsv']})
  assert.equal(imported.status, 'editable', imported.status === 'editable' ? '' : imported.issues.join(', '))
  if (imported.status !== 'editable') return
  assert.equal(creator.inspectDraft(imported.draft).files[0].path, 'image.tif')
  const original = creator.materializeDraft(imported.draft)
  if (original.status !== 'materialized') throw Error('export failed')
  assert.deepEqual(original.files.get('file_list.tsv'), new TextEncoder().encode(table))
  assert.deepEqual(original.files.get('ro-crate-metadata.json'), new TextEncoder().encode(metadata))
  const change = creator.applyChange(imported.draft, {type:'update-file', file:{path:'image.tif', size:'11', datasetId:dataset, specimenId:specimen, type:'image'}})
  if (change.status !== 'applied') throw Error('file edit rejected')
  const output = creator.materializeDraft(change.draft)
  if (output.status !== 'materialized') throw Error('export failed')
  assert.equal(new TextDecoder().decode(output.files.get('file_list.tsv') as Uint8Array), table.replace('image.tif\t10\t', 'image.tif\t11\t'))
  assert.deepEqual(output.files.get('ro-crate-metadata.json'), new TextEncoder().encode(metadata))
  assert.equal(creator.applyChange(change.draft, {type:'delete-entity', entityId:dataset}).status, 'rejected')
})

test('unsupported manifest and malformed metadata remain read-only with exact recovery', async () => {
  const graph = JSON.parse(descriptor)
  graph['@graph'].push({'@id':'file_list.tsv','@type':['bia:FileList']})
  const bytes = new Uint8Array([255, 254])
  const inputs = [new Map([['ro-crate-metadata.json', bytes]]), new Map([['ro-crate-metadata.json', new TextEncoder().encode(JSON.stringify(graph))], ['file_list.tsv', new TextEncoder().encode('not a supported table\n')]])]
  for (const files of inputs) {
    const paths = [...files.keys()]
    const result = await creator.importCrate(files, {metadataPaths:paths})
    assert.equal(result.status, 'read-only')
    if (result.status === 'read-only') for (const path of paths) assert.deepEqual(result.files.get(path), files.get(path))
  }
})

test('nested and encoded identifiers are reserved when minting', async () => {
  const text = descriptor.replace('"count":42', '"count":42,"unknown":{"@id":"./#entity-%32"}')
  const result = await creator.importCrate(new Map([['ro-crate-metadata.json', text]]), {metadataPaths:['ro-crate-metadata.json']})
  if (result.status !== 'editable') throw Error('import rejected')
  const added = creator.applyChange(result.draft, {type:'add-entity', kind:'biosample'})
  if (added.status !== 'applied') throw Error('entity rejected')
  assert.equal(added.entityId, '#entity-3')
})

test('a context alias that can shadow an owned property cannot be edited', async () => {
  const text = descriptor.replace('"bia":"http://bia/"', '"bia":"http://bia/","otherName":{"@id":"http://schema.org/name"}')
  const result = await creator.importCrate(new Map([['ro-crate-metadata.json', text]]), {metadataPaths:['ro-crate-metadata.json']})
  assert.equal(result.status, 'read-only')
})

test('pinned BIA context is accepted for the supported graph', async () => {
  const {readFileSync} = await import('node:fs')
  const pinned = JSON.parse(readFileSync(new URL('../../../../tests/parity/fixtures/test_typical_ro_crate/ro-crate-metadata.json', import.meta.url), 'utf8'))
  const source = JSON.parse(descriptor)
  source['@context'] = pinned['@context']
  const result = await creator.importCrate(new Map([['ro-crate-metadata.json', JSON.stringify(source)]]), {metadataPaths:['ro-crate-metadata.json']})
  assert.equal(result.status, 'editable', result.status === 'editable' ? '' : result.issues.join(', '))
})

test('expanded aliases of managed properties and duplicate resolved IDs are read-only', async () => {
  const alias = descriptor.replace('"name":"Original"', '"name":"Original","http://schema.org/name":"Other"')
  const duplicate = descriptor.replace('{"@id":"#entity-1","@type":"bia:Unknown","payload":"preserved"}', '{"@id":"#entity-1","@type":"bia:Unknown"},{"@id":"./#entity-%31","@type":"bia:Unknown"}')
  for (const text of [alias, duplicate]) {
    const result = await creator.importCrate(new Map([['ro-crate-metadata.json', text]]), {metadataPaths:['ro-crate-metadata.json']})
    assert.equal(result.status, 'read-only')
  }
})

test('unmapped owned properties and nested graph injection are read-only', async () => {
  const unmapped = descriptor.replace('"count":42', '"count":42,"imagingPreparationProtocol":[{"@id":"#entity-1"}]')
  const embedded = descriptor.replace('"custom":{"@id":"#entity-1"}', '"custom":{"@id":"./","name":"other"}')
  for (const text of [unmapped, embedded]) {
    const result = await creator.importCrate(new Map([['ro-crate-metadata.json', text]]), {metadataPaths:['ro-crate-metadata.json']})
    assert.equal(result.status, 'read-only')
  }
})

test('image payload cannot be admitted as auxiliary metadata', async () => {
  const files = new Map([['ro-crate-metadata.json', new TextEncoder().encode(descriptor)], ['image.tif', new Uint8Array([1, 2])]])
  const result = await creator.importCrate(files, {metadataPaths:['ro-crate-metadata.json','image.tif']})
  assert.equal(result.status, 'rejected')
})

test('keyword aliases remain read-only with source bytes preserved', async () => {
  for (const [alias, keyword] of [['subject','@id'], ['nested','@context'], ['graphAlias','@graph']] as const) for (const mapping of [`"${keyword}"`, `{"@id":"${keyword}"}`]) {
    const text = descriptor.replace('"bia":"http://bia/"', `"bia":"http://bia/","${alias}":${mapping}`).replace('"count":42', `"count":42,"opaque":{"${alias}":"#entity-2"}`)
    const result = await creator.importCrate(new Map([['ro-crate-metadata.json', text]]), {metadataPaths:['ro-crate-metadata.json']})
    assert.equal(result.status, 'read-only')
    if (result.status === 'read-only') assert.deepEqual(result.files.get('ro-crate-metadata.json'), new TextEncoder().encode(text))
  }
})

test('binary or malformed auxiliary text remains read-only with exact recovery', async () => {
  for (const auxiliary of [new Uint8Array([255, 0]), new Uint8Array([65, 0, 66])]) {
    const files = new Map([['ro-crate-metadata.json', new TextEncoder().encode(descriptor)], ['image.csv', auxiliary]])
    const result = await creator.importCrate(files, {metadataPaths:['ro-crate-metadata.json','image.csv']})
    assert.equal(result.status, 'read-only')
    if (result.status === 'read-only') assert.deepEqual(result.files.get('image.csv'), auxiliary)
  }
})

test('import snapshots the metadata selection before asynchronous reads', async () => {
  const paths = ['ro-crate-metadata.json', 'notes.txt']
  const files = new Map([['ro-crate-metadata.json', descriptor], ['notes.txt', 'Original notes'], ['image.tif', 'payload']])
  const pending = creator.importCrate(files, {metadataPaths: paths})
  paths.pop()
  const result = await pending
  assert.equal(result.status, 'editable')
  if (result.status !== 'editable') throw Error('import failed')
  assert.deepEqual(result.excludedPaths, ['image.tif'])
  const output = creator.materializeDraft(result.draft)
  if (output.status !== 'materialized') throw Error('export failed')
  assert.deepEqual(output.files.get('notes.txt'), new TextEncoder().encode('Original notes'))
})

test('oversized selections are rejected before enumerating their entries', async () => {
  const files = new Map(Array.from({length: 10001}, (_, index) => [`image-${index}.tif`, ''] as const))
  files.entries = () => {throw Error('Oversized selection must not be enumerated')}
  const result = await creator.importCrate(files, {metadataPaths: ['ro-crate-metadata.json']})
  assert.equal(result.status, 'rejected')
  if (result.status !== 'rejected') throw Error('selection was adopted')
  assert.match(result.issues.join(' '), /selection.*limit/i)
})

test('an extra manifest column cannot alias an owned property', async () => {
  let draft = creator.createDraft()
  const step = (change: creator.DraftChange) => {
    const result = creator.applyChange(draft, change)
    if (result.status !== 'applied') throw Error('setup failed')
    draft = result.draft
    return result.entityId
  }
  step({type: 'add-study'})
  const datasetId = step({type: 'add-entity', kind: 'dataset'})
  const specimenId = step({type: 'add-entity', kind: 'specimen'})
  step({type: 'add-file', file: {path: 'image.tif', size: '1', datasetId, specimenId, type: 'image'}})
  const output = creator.materializeDraft(draft)
  if (output.status !== 'materialized') throw Error('setup failed')
  const metadata = JSON.parse(output.files.get('ro-crate-metadata.json') as string)
  const schema = metadata['@graph'].find((node: Record<string, unknown>) => node['@id'] === '#file-list-schema')
  schema.column.push({'@id': '#alias-column'})
  metadata['@graph'].push({'@id': '#alias-column', '@type': ['csvw:Column'], columnName: 'other_path', propertyUrl: 'http://bia/filePath'})
  const descriptor = JSON.stringify(metadata)
  const table = (output.files.get('file_list.tsv') as string).replace(/\n$/, '').split('\n').map((line, index) => line + (index ? '\tother.tif' : '\tother_path')).join('\n') + '\n'
  const result = await creator.importCrate(new Map([['ro-crate-metadata.json', descriptor], ['file_list.tsv', table]]), {metadataPaths: ['ro-crate-metadata.json', 'file_list.tsv']})
  assert.equal(result.status, 'read-only')
  if (result.status === 'read-only') assert.deepEqual(result.files.get('file_list.tsv'), new TextEncoder().encode(table))
})
