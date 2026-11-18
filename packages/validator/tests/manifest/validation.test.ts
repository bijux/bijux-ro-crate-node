import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {FileListValidationError, validateFileList} from '../../src/manifest/validation.js'
import {createWorkspace as workspaceFor} from '@bijux/ro-crate-core'
import type {ValidationIssue} from '@bijux/ro-crate-core'

type Entity = Record<string, unknown> & {'@id': string; '@type': string | string[]}
async function fixture(name: string, text?: string) {
  const root = new URL(`../../../../tests/parity/fixtures/${name}/`, import.meta.url)
  const document: {'@graph': Entity[]} = JSON.parse(await readFile(new URL('ro-crate-metadata.json', root), 'utf8'))
  const entities = new Map(document['@graph'].map(entity => [entity['@id'], entity] as [string, Entity]))
  const modelTypes = new Map(document['@graph'].map(entity => [
    entity['@id'],
    [entity['@type']].flat().find(type => type.startsWith('bia:'))?.slice(4)
  ] as [string, string | undefined]))
  const workspace = workspaceFor(new Map([
    ['file_list.tsv', text ?? await readFile(new URL('file_list.tsv', root), 'utf8')]
  ]))
  return {metadata: {entities, modelTypes}, workspace}
}

test('file-list validation returns metadata references from the upstream fixture', async () => {
  const {metadata, workspace} = await fixture('test_file_list_metadata_reference_connects_entity')
  const issues: ValidationIssue[] = []
  const references = await validateFileList(metadata, workspace, issues)

  assert.deepEqual([...references!].sort(), ['#dataset', '#specimen_1'])
  assert.deepEqual(issues, [])
})

test('file-list validation reports a missing metadata reference directly', async () => {
  const {metadata, workspace} = await fixture('test_file_list_missing_metadata_reference')
  const issues: ValidationIssue[] = []
  await assert.rejects(validateFileList(metadata, workspace, issues), FileListValidationError)
  assert.deepEqual(issues, [{
    message: '#missing_specimen does not exist in ro-crate-metadata.json',
    severity: 40,
    location_description: 'In file list, at row: file_a.txt.'
  }])
})

test('file-list validation checks missing and incorrectly typed self references', async () => {
  const {metadata, workspace} = await fixture('test_file_list_self_reference_mismatch')
  const issues: ValidationIssue[] = []
  await assert.rejects(validateFileList(metadata, workspace, issues), FileListValidationError)
  assert.deepEqual(issues, [{
    message: "Reference 'missing_input_image' not found in file list.",
    severity: 40,
    location_description: 'In file list, at row: processed_image'
  }, {
    message: "Reference 'input_file' has no rdf:type, expected 'http://bia/Image'.",
    severity: 40,
    location_description: 'In file list, at row: processed_image'
  }])
})

test('file-list duplicate detection uses inferred path values including quoted numbers', async () => {
  const {metadata, workspace} = await fixture('test_minimal_valid_ro_crate',
    'file_path\tdataset\n"01"\tNA\n1\tNA\n')
  const issues: ValidationIssue[] = []
  await assert.rejects(validateFileList(metadata, workspace, issues), FileListValidationError)
  assert.deepEqual(issues, [{
    message: 'File list contains multiple references to the same file path.',
    severity: 40,
    location_description: null
  }])
})
