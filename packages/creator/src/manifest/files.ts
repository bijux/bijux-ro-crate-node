import {createWorkspace} from '@bijux/ro-crate-core'
import type {EntityView} from '../document/draft.js'

export interface FileRow {
  readonly path: string
  readonly size: string
  readonly datasetId: string
  readonly specimenId: string
  readonly type: 'image' | 'annotation'
  readonly sourceImage?: string
}

/** Validate the complete candidate inventory before it becomes document state. */
export function fileIssue(files: readonly FileRow[], entities: readonly EntityView[]): string | null {
  const paths = new Set<string>()
  const kinds = new Map(entities.map(entity => [entity.id, entity.kind]))
  const byPath = new Map(files.map(file => [file.path, file]))
  for (const file of files) {
    if (!file || typeof file.path !== 'string' || !/^[\p{L}\p{N}_](?:[\p{L}\p{N}_. /-]*[\p{L}\p{N}_])?$/u.test(file.path) || !Number.isNaN(Number(file.path)) || /^(?:na|n\/a|null|none|nan|inf|infinity|true|false)$/i.test(file.path)) return 'File path must use the supported directory and filename characters'
    if (file.path === 'file_list.tsv' || file.path === 'ro-crate-metadata.json') return 'File path is reserved for metadata'
    if (paths.has(file.path)) return 'Duplicate file path'
    paths.add(file.path)
    if (typeof file.size !== 'string' || !/^(0|[1-9][0-9]*)$/.test(file.size)) return 'Size must be a non-negative decimal integer string'
    if (kinds.get(file.datasetId) !== 'dataset') return 'Dataset reference must identify a dataset'
    if (kinds.get(file.specimenId) !== 'specimen') return 'Specimen reference must identify a specimen'
    if (file.type !== 'image' && file.type !== 'annotation') return 'File type must be image or annotation'
    if (file.sourceImage !== undefined && (file.type !== 'annotation' || typeof file.sourceImage !== 'string')) return 'Only annotations can reference a source image'
  }
  try {
    const workspace = createWorkspace(new Map([...files.map(file => [file.path, ''] as const), ['ro-crate-metadata.json', ''] as const, ['file_list.tsv', ''] as const]))
    if (files.some(file => workspace.resolveFile(file.path) !== file.path)) return 'File path must be canonical and crate-relative'
  } catch {return 'File paths must be unique, canonical and crate-relative'}
  for (const file of files) if (file.sourceImage !== undefined && byPath.get(file.sourceImage)?.type !== 'image') return 'Source image must identify an existing image file'
  return null
}

const columns = [
  ['file_path', 'http://bia/filePath'], ['size_in_bytes', 'http://bia/sizeInBytes'],
  ['dataset', 'http://schema.org/isPartOf'], ['specimen', 'http://bia/associatedSubject'],
  ['type', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'], ['input_image', 'http://bia/associatedSourceImage'],
] as const
const cell = (value: string) => /[\t\r\n"]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value
export function manifestOutput(files: readonly FileRow[]) {
  const table = [columns.map(([name]) => name), ...files.map(file => [file.path, file.size, file.datasetId, file.specimenId, file.type === 'image' ? 'http://bia/Image' : 'http://bia/AnnotationData', file.sourceImage ?? ''])].map(row => row.map(cell).join('\t')).join('\n') + '\n'
  const refs = columns.map((_, index) => ({'@id': `#file-list-column-${index}`}))
  const nodes = [
    {'@id': 'file_list.tsv', '@type': ['File', 'bia:FileList', 'csvw:Table'], tableSchema: {'@id': '#file-list-schema'}},
    ...columns.map(([columnName, propertyUrl], index) => ({'@id': refs[index]['@id'], '@type': ['csvw:Column'], columnName, propertyUrl})),
    {'@id': '#file-list-schema', '@type': ['csvw:Schema'], column: refs},
  ]
  return {table, nodes}
}
