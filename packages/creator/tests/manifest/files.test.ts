import assert from 'node:assert/strict'
import {test} from 'node:test'
import {applyChange, createDraft, inspectDraft, inspectIncomingReferences, materializeDraft, type DraftChange} from '../../src/index.js'

test('file rows preserve distinct dataset and specimen links and source-image references', () => {
  let draft = createDraft()
  const step = (change: DraftChange) => {const result = applyChange(draft, change); assert.equal(result.status, 'applied'); if (result.status !== 'applied') throw Error(JSON.stringify(result)); draft = result.draft; return result.entityId}
  step({type: 'add-study'})
  const specimenA = step({type: 'add-entity', kind: 'specimen'})
  const specimenB = step({type: 'add-entity', kind: 'specimen'})
  const datasetA = step({type: 'add-entity', kind: 'dataset'})
  const datasetB = step({type: 'add-entity', kind: 'dataset'})
  step({type: 'add-file', file: {path: 'Images/α.tif', size: '9007199254740993', datasetId: datasetA, specimenId: specimenA, type: 'image'}})
  step({type: 'add-file', file: {path: 'Annotations/β.csv', size: '12', datasetId: datasetB, specimenId: specimenB, type: 'annotation', sourceImage: 'Images/α.tif'}})
  step({type: 'set-field', entityId: datasetA, field: 'name', value: 'Renamed'})
  const result = materializeDraft(draft)
  if (result.status !== 'materialized') throw Error('missing output')
  assert.equal(result.files.get('file_list.tsv'), 'file_path\tsize_in_bytes\tdataset\tspecimen\ttype\tinput_image\nImages/α.tif\t9007199254740993\t#entity-3\t#entity-1\thttp://bia/Image\t\nAnnotations/β.csv\t12\t#entity-4\t#entity-2\thttp://bia/AnnotationData\tImages/α.tif\n')
  type GraphNode = {'@id': string; hasPart?: unknown; column?: Array<{'@id': string}>; columnName?: string; propertyUrl?: string; name?: string}
  const metadata = JSON.parse(result.files.get('ro-crate-metadata.json') as string) as {'@graph': GraphNode[]}
  const graph = new Map(metadata['@graph'].map(node => [node['@id'], node]))
  assert.deepEqual(graph.get('./')?.hasPart, [{'@id': datasetA}, {'@id': datasetB}, {'@id': 'file_list.tsv'}])
  assert.deepEqual(graph.get('file_list.tsv'), {'@id': 'file_list.tsv', '@type': ['File', 'bia:FileList', 'csvw:Table'], tableSchema: {'@id': '#file-list-schema'}})
  assert.deepEqual(graph.get('#file-list-schema')?.column?.map(x => graph.get(x['@id'])?.columnName), ['file_path', 'size_in_bytes', 'dataset', 'specimen', 'type', 'input_image'])
  assert.deepEqual(graph.get('#file-list-schema')?.column?.map(x => graph.get(x['@id'])?.propertyUrl), ['http://bia/filePath', 'http://bia/sizeInBytes', 'http://schema.org/isPartOf', 'http://bia/associatedSubject', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'http://bia/associatedSourceImage'])
  assert.equal(graph.get(datasetA)?.name, 'Renamed')
  assert.deepEqual(inspectIncomingReferences(draft, specimenA), [{sourceId: 'Images/α.tif', relationship: 'manifestSpecimen'}])
  const view = inspectDraft(draft)
  ;(view.files[0] as {path: string}).path = 'outside'
  assert.equal(inspectDraft(draft).files[0].path, 'Images/α.tif')
})

test('unsafe rows, wrong targets, duplicate paths and referenced deletion fail atomically', () => {
  let draft = createDraft()
  const step = (change: DraftChange) => {const result = applyChange(draft, change); if (result.status !== 'applied') throw Error(JSON.stringify(result)); draft = result.draft; return result.entityId}
  step({type: 'add-study'})
  const dataset = step({type: 'add-entity', kind: 'dataset'})
  const specimen = step({type: 'add-entity', kind: 'specimen'})
  const base = {path: 'data/a.tif', size: '1', datasetId: dataset, specimenId: specimen, type: 'image' as const}
  step({type: 'add-file', file: base})
  step({type: 'add-file', file: {path: 'data/annotation.csv', size: '2', datasetId: dataset, specimenId: specimen, type: 'annotation', sourceImage: 'data/a.tif'}})
  const before = inspectDraft(draft)
  for (const file of [base, {...base, path: '../a'}, {...base, path: 'file_list.tsv'}, {...base, path: 'data/a.tif/child'}, {...base, path: 'a/./b'}, {...base, path: 'x\ty'}, {...base, path: 'x', size: '1.5'}, {...base, path: 'x', size: 9007199254740993}, {...base, path: 'x', datasetId: specimen}, {...base, path: 'x', specimenId: '#missing'}, {...base, path: 'x', type: 'annotation', sourceImage: 'data/annotation.csv'}]) {
    assert.equal(applyChange(draft, {type: 'add-file', file} as DraftChange).status, 'rejected')
  }
  assert.equal(applyChange(draft, {type: 'delete-file', path: 'data/a.tif'}).status, 'rejected')
  assert.equal(applyChange(draft, {type: 'update-file', file: {...base, type: 'annotation'}}).status, 'rejected')
  assert.equal(applyChange(draft, {type: 'delete-entity', entityId: dataset}).status, 'rejected')
  assert.deepEqual(inspectDraft(draft), before)
  step({type: 'delete-file', path: 'data/annotation.csv'})
  step({type: 'delete-file', path: 'data/a.tif'})
  step({type: 'delete-entity', entityId: dataset})
})


test('file updates are transactional and preserve owned file data', () => {
  let draft = createDraft()
  const step = (change: DraftChange) => {const result = applyChange(draft, change); if (result.status !== 'applied') throw Error(JSON.stringify(result)); draft = result.draft; return result.entityId}
  step({type: 'add-study'})
  const dataset = step({type: 'add-entity', kind: 'dataset'})
  const specimen = step({type: 'add-entity', kind: 'specimen'})
  const input = {path: 'Images/bright.tif', size: '3', datasetId: dataset, specimenId: specimen, type: 'image' as const}
  step({type: 'add-file', file: input})
  ;(input as {size: string}).size = '999'
  assert.equal(inspectDraft(draft).files[0].size, '3')
  step({type: 'update-file', file: {...input, size: '4'}})
  const output = materializeDraft(draft)
  if (output.status !== 'materialized') throw Error('missing output')
  assert.match(output.files.get('file_list.tsv') as string, /Images\/bright\.tif\t4\t/)
  assert.equal(applyChange(draft, {type: 'update-file', file: {...input, path: 'missing'}}).status, 'rejected')
})
