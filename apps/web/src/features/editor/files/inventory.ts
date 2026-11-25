import {fromDirectory, createWorkspace} from '@bijux/ro-crate-core'
import {applyChanges, inspectDraft, type DraftDocument, type FileRow, type DraftChange} from '@bijux/ro-crate-creator'

export function listingFiles(files: readonly {readonly name:string; readonly size:number; readonly webkitRelativePath:string}[], mode:'files' | 'directory'): {path:string; size:string}[] {
  if (mode === 'directory') return [...fromDirectory(files)].map(([path, file]) => ({path, size:String(file.size)}))
  if (files.some(file => file.webkitRelativePath || !file.name || /[\\/]/.test(file.name) || file.name === '.' || file.name === '..')) throw new Error('Select individual files with safe file names.')
  for (const name of new Set(files.map(file => file.name))) {
    if (createWorkspace(new Map([[name, '']])).resolveFile(name) !== name) throw new Error('Select individual files with safe file names.')
  }
  return files.map(file => ({path:file.name, size:String(file.size)}))
}

export interface PendingFile {readonly id: string; readonly path: string; readonly size: string}
export interface InventoryRow {readonly id: string; readonly path: string; readonly size: string; readonly conflict: boolean; readonly pending: boolean; readonly file?: FileRow}
export function stageFiles(existing: readonly PendingFile[], files: readonly {path: string; size: string}[]): PendingFile[] {
  let next = existing.reduce((max, row) => Math.max(max, Number(row.id.slice(2)) || 0), 0)
  return [...existing, ...files.map(file => ({...file, id:`p:${++next}`}))]
}
export function inventoryRows(files: readonly FileRow[], pending: readonly PendingFile[]): InventoryRow[] {
  const counts = new Map<string, number>()
  for (const row of [...files, ...pending]) counts.set(row.path, (counts.get(row.path) ?? 0) + 1)
  return [...files.map(file => ({id:`f:${file.path}`, path:file.path, size:file.size, conflict:(counts.get(file.path) ?? 0) > 1, pending:false, file})), ...pending.map(row => ({...row, conflict:(counts.get(row.path) ?? 0) > 1, pending:true}))]
}
const selectionKey = (selection: ReadonlySet<string>) => [...selection].sort().join('\0')
type Ready = {status:'ready'; draft:DraftDocument; pending:readonly PendingFile[]; selection:string; result:DraftDocument; removed:ReadonlySet<string>; count:number}
type Preview = Ready | {status:'blocked'; message:string}
export function previewAssignment(draft: DraftDocument, pending: readonly PendingFile[], selection: ReadonlySet<string>, datasetId:string, specimenId:string): Preview {
  const rows = inventoryRows(inspectDraft(draft).files, pending).filter(row => selection.has(row.id))
  if (!rows.length || rows.length !== selection.size) return {status:'blocked', message:'Select files to assign.'}
  if (rows.some(row => row.conflict)) return {status:'blocked', message:'Resolve duplicate or conflicting paths before assignment.'}
  const changes: DraftChange[] = rows.map(row => ({type:row.pending ? 'add-file' : 'update-file', file:{...(row.file ?? {path:row.path,size:row.size,type:'image' as const}), datasetId, specimenId}}))
  const result = applyChanges(draft, changes)
  if (result.status === 'rejected') return {status:'blocked', message:result.issues.map(issue => issue.message).join('; ')}
  return {status:'ready',draft,pending,selection:selectionKey(selection),result:result.draft,removed:new Set(rows.filter(row => row.pending).map(row => row.id)),count:rows.length}
}
export function applyPreview(preview: Ready, draft:DraftDocument, pending:readonly PendingFile[], selection:ReadonlySet<string>) {
  if (preview.draft !== draft || preview.pending !== pending || preview.selection !== selectionKey(selection)) return {status:'stale' as const}
  return {status:'applied' as const, draft:preview.result, pending:pending.filter(row => !preview.removed.has(row.id))}
}
