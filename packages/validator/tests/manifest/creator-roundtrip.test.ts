import assert from 'node:assert/strict'
import {test} from 'node:test'
import {applyChange, createDraft, materializeDraft, type DraftChange} from '@bijux/ro-crate-creator'
import {createWorkspace, type ValidationIssue} from '@bijux/ro-crate-core'
import {validateFileList} from '../../src/manifest/validation.js'
import {parseTSV} from '../../src/manifest/tsv.js'

test('creator rejects paths with ambiguous manifest interpretation and preserves safe mixed rows', async () => {
  let draft = createDraft()
  const step = (change: DraftChange) => {const result = applyChange(draft, change); assert.equal(result.status, 'applied'); if (result.status !== 'applied') throw Error(); draft = result.draft; return result.entityId}
  step({type: 'add-study'})
  const datasetId = step({type: 'add-entity', kind: 'dataset'})
  const specimenId = step({type: 'add-entity', kind: 'specimen'})
  const row = {size: '1', datasetId, specimenId, type: 'image' as const}
  for (const path of ['[image]', '"image"', "'image'", 'Images/[image]', 'Images/image]', 'Images/"image"', "Images/image'", 'NA', 'null', '123', '1.5', 'true', 'FALSE', '=1+1', '+formula', '-formula', '@formula']) {
    assert.equal(applyChange(draft, {type: 'add-file', file: {...row, path}}).status, 'rejected', path)
  }
  step({type: 'add-file', file: {...row, path: 'image.tif'}})
  step({type: 'add-file', file: {...row, path: 'mask.tif', type: 'annotation', sourceImage: 'image.tif'}})
  step({type: 'add-file', file: {...row, path: 'Images/α.tif'}})
  step({type: 'add-file', file: {...row, path: 'Images/123'}})
  step({type: 'add-file', file: {...row, path: 'Images/NA'}})
  step({type: 'add-file', file: {...row, path: 'Images/true'}})
  step({type: 'add-file', file: {...row, path: 'Annotations/result.csv', type: 'annotation', sourceImage: 'Images/α.tif'}})
  const output = materializeDraft(draft)
  if (output.status !== 'materialized') throw Error()
  const table = parseTSV(output.files.get('file_list.tsv') as string)
  assert.deepEqual(table.columns.get('file_path')?.values, ['image.tif', 'mask.tif', 'Images/α.tif', 'Images/123', 'Images/NA', 'Images/true', 'Annotations/result.csv'])
  assert.equal(table.columns.get('input_image')?.values[1], 'image.tif')
  assert.equal(table.columns.get('input_image')?.values[6], 'Images/α.tif')
  const metadata = JSON.parse(output.files.get('ro-crate-metadata.json') as string)
  const entities = new Map<string, Record<string, unknown> & {'@id': string}>(metadata['@graph'].map((entry: {'@id': string}) => [entry['@id'], entry]))
  const modelTypes = new Map<string, string>([['file_list.tsv', 'FileList'], [datasetId, 'Dataset'], [specimenId, 'Specimen']])
  const issues: ValidationIssue[] = []
  const inbound = await validateFileList({entities, modelTypes}, createWorkspace(output.files), issues)
  assert.deepEqual(issues, [])
  assert.ok(inbound)
  assert.deepEqual([...inbound].sort(), [datasetId, specimenId].sort())
})
