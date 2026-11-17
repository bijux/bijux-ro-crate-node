export {createWorkspace, snapshotFiles} from './crate/files.js'
export {fromDirectory} from './crate/directory-selection.js'
export {createDocumentLoader} from './resources/document-loader.js'
export {reportOf, SEVERITY} from './diagnostics/report.js'
export {decodeCrateReference} from './crate/paths.js'

export type CrateValue = string | Blob | Uint8Array | ArrayBuffer
export type CrateFiles = ReadonlyMap<string, CrateValue>
export interface CrateWorkspace {
  has(path: string): boolean
  /** Resolve a decoded local reference to a selected file, without URI or network lookup. */
  resolveFile(path: string): string | null
  readText(path: string): Promise<string>
}
export interface DirectoryEntry { readonly webkitRelativePath: string }
export interface LoadedDocument { documentUrl: string; contextUrl: null; document: unknown }
export type Severity = 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG'
export interface ValidationIssue { message: string; severity: 10 | 20 | 30 | 40 | 50; location_description: string | null }
export interface ValidationReport { highest_error_level: Severity | null; issues: Record<Severity, ValidationIssue[]> }
