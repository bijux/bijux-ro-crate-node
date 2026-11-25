import {applyChange, type DraftChange, type DraftDocument} from './draft.js'
import {own, stateOf, type ImportedSource} from './state.js'
import {fileIssue, type FileRow} from '../manifest/files.js'

type Issue = {readonly code: string; readonly message: string}
export type BulkResult = {readonly status: 'applied'; readonly draft: DraftDocument; readonly entityIds: readonly string[]} | {readonly status: 'rejected'; readonly issues: readonly Issue[]; readonly index: number}
type FileChange = Extract<DraftChange, {type: 'add-file' | 'update-file'}> | Extract<DraftChange, {type: 'delete-file'}>
const reject = (index: number, code: string, message: string): BulkResult => ({status: 'rejected', index, issues: [{code, message}]})
function isFileChange(change: DraftChange): change is FileChange {return change?.type === 'add-file' || change?.type === 'update-file' || change?.type === 'delete-file'}

function updateImportedRows(source: ImportedSource, changes: readonly FileChange[]): ImportedSource {
  if (!source.manifest) return source
  const headers = source.manifest.headers
  const rows = source.manifest.rows.map(row => [...row])
  const paths = new Map(rows.map(row => [row[headers.indexOf('file_path')], row]))
  for (const change of changes) if (change.type === 'update-file') {
    const row = paths.get(change.file.path)!
    for (const [key, value] of Object.entries({size_in_bytes:change.file.size, dataset:change.file.datasetId, specimen:change.file.specimenId, type:change.file.type === 'image' ? 'http://bia/Image' : 'http://bia/AnnotationData', input_image:change.file.sourceImage ?? ''})) row[headers.indexOf(key)] = value
  }
  return {...source, manifest:{headers, rows, dirty:true}}
}

/** Apply consecutive file operations against one candidate inventory. */
function fileBatch(draft: DraftDocument, changes: readonly FileChange[], offset: number): BulkResult {
  const state = stateOf(draft)
  if (!state.study) return reject(offset, 'invalid-change', 'A study is required')
  const files = new Map(state.files.map(file => [file.path, file]))
  const entityIds: string[] = []
  for (const [position, change] of changes.entries()) {
    const index = offset + position
    if (state.source && change.type !== 'update-file') return reject(index, 'incomplete-reference-inventory', 'File addition and deletion are unavailable for imported content')
    if (change.type === 'delete-file') {
      if (!files.has(change.path)) return reject(index, 'unknown-file', 'File path does not exist')
      files.delete(change.path); entityIds.push(change.path); continue
    }
    if (!change.file || typeof change.file !== 'object') return reject(index, 'invalid-change', 'A file row is required')
    const {path, size, datasetId, specimenId, type, sourceImage} = change.file
    if (typeof path !== 'string') return reject(index, 'invalid-file', 'A file path is required')
    if (change.type === 'add-file' && files.has(path)) return reject(index, 'duplicate-file', 'File path already exists')
    if (change.type === 'update-file' && !files.has(path)) return reject(index, 'unknown-file', 'File path does not exist')
    const row: FileRow = {path, size, datasetId, specimenId, type, ...(sourceImage === undefined ? {} : {sourceImage})}
    files.set(path, row); entityIds.push(path)
  }
  const inventory = [...files.values()]
  const issue = fileIssue(inventory, state.entities)
  if (issue) return reject(offset + changes.length - 1, 'invalid-file', issue)
  return {status:'applied', draft:own({...state, files:inventory, revision:state.revision + changes.length, ...(state.source ? {source:updateImportedRows(state.source, changes)} : {})}), entityIds}
}

export function applyChanges(draft: DraftDocument, changes: readonly DraftChange[]): BulkResult {
  stateOf(draft)
  if (!Array.isArray(changes) || changes.length === 0) return reject(0, 'empty-batch', 'At least one change is required')
  let current = draft
  const entityIds: string[] = []
  for (let index = 0; index < changes.length;) {
    const change = changes[index]
    if (isFileChange(change)) {
      let end = index + 1
      while (end < changes.length && isFileChange(changes[end])) end++
      const result = fileBatch(current, changes.slice(index, end) as FileChange[], index)
      if (result.status === 'rejected') return result
      current = result.draft; entityIds.push(...result.entityIds); index = end
    } else {
      const result = applyChange(current, change)
      if (result.status === 'rejected') return {status:'rejected', index, issues:result.issues}
      current = result.draft; entityIds.push(result.entityId); index++
    }
  }
  return {status:'applied', draft:current, entityIds}
}
