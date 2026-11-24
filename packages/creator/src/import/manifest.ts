import {fileIssue, type FileRow} from '../manifest/files.js'
import type {EntityView} from '../document/draft.js'

const required: Record<string, string> = {
  file_path:'http://bia/filePath', size_in_bytes:'http://bia/sizeInBytes', dataset:'http://schema.org/isPartOf',
  specimen:'http://bia/associatedSubject', type:'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', input_image:'http://bia/associatedSourceImage',
}
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
function parseTable(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false; let closed = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {cell += '"'; i++}
      else if (char === '"') {quoted = false; closed = true}
      else cell += char
    } else if (char === '"' && !cell && !closed) quoted = true
    else if (char === '\t') {row.push(cell); cell = ''; closed = false}
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''; closed = false
    } else {if (closed || char === '"') throw Error('Unsupported TSV quoting'); cell += char}
  }
  if (quoted) throw Error('Unclosed TSV quote')
  if (row.length || cell || closed) {row.push(cell); rows.push(row)}
  return rows
}
export function importManifest(metadata: Record<string, unknown>, bytes: Uint8Array, entities: EntityView[]): {files: FileRow[]; manifest: {headers: string[]; rows: string[][]; dirty: false}} {
  const table = parseTable(new TextDecoder('utf-8', {fatal:true}).decode(bytes))
  const headers = table.shift()
  if (!headers || new Set(headers).size !== headers.length || Object.keys(required).some(name => !headers.includes(name))) throw Error('Unsupported file-list columns')
  if (table.some(row => row.length !== headers.length)) throw Error('Malformed file-list row')
  const graph = metadata['@graph'] as Record<string, unknown>[]
  const manifest = graph.find(node => node['@id'] === 'file_list.tsv')
  const schema = graph.find(node => node['@id'] === object(manifest?.tableSchema)?.['@id'])
  if (!Array.isArray(schema?.column)) throw Error('Unsupported file-list schema')
  const schemaColumns = schema.column.map(ref => graph.find(node => node['@id'] === object(ref)?.['@id']))
  if (schemaColumns.length !== headers.length || schemaColumns.some(node => !node || typeof node.columnName !== 'string' || typeof node.propertyUrl !== 'string') || new Set(schemaColumns.map(node => node!.columnName)).size !== headers.length) throw Error('Ambiguous file-list schema')
  for (const name of headers) {
    const column = schemaColumns.find(node => node!.columnName === name)
    if (!column || (Object.hasOwn(required, name) && column.propertyUrl !== required[name])) throw Error('Unsupported file-list mapping')
    if (!Object.hasOwn(required, name) && typeof column.propertyUrl === 'string' && Object.values(required).includes(column.propertyUrl)) throw Error('Ambiguous file-list property mapping')
  }
  const files: FileRow[] = table.map(row => {
    const get = (name: string) => row[headers.indexOf(name)]
    const kind = get('type')
    if (kind !== 'http://bia/Image' && kind !== 'http://bia/AnnotationData') throw Error('Unsupported file type')
    const source = get('input_image')
    return {path:get('file_path'), size:get('size_in_bytes'), datasetId:get('dataset'), specimenId:get('specimen'), type:kind === 'http://bia/Image' ? 'image' : 'annotation', ...(source ? {sourceImage:source} : {})}
  })
  const issue = fileIssue(files, entities)
  if (issue) throw Error(issue)
  return {files, manifest:{headers, rows:table, dirty:false}}
}
