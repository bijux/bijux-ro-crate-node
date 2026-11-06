export type CrateValue = string | Blob | Uint8Array | ArrayBuffer
export type CrateFiles = ReadonlyMap<string, CrateValue>
export interface CrateWorkspace {
  has(path: string): boolean
  readText(path: string): Promise<string>
}
export function createWorkspace(files: CrateFiles): CrateWorkspace
export function snapshotFiles(files: CrateFiles): Map<string, CrateValue>
export function fromDirectory(files: Iterable<File> | FileList): Map<string, File>
export interface LoadedDocument { documentUrl: string; contextUrl: null; document: unknown }
export function createDocumentLoader(contexts?: ReadonlyMap<string, unknown>): (url: string) => Promise<LoadedDocument>
export type Severity = 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG'
export interface ValidationIssue { message: string; severity: 10 | 20 | 30 | 40 | 50; location_description: string | null }
export interface ValidationReport { highest_error_level: Severity | null; issues: Record<Severity, ValidationIssue[]> }
export const SEVERITY: Readonly<Record<Severity, 10 | 20 | 30 | 40 | 50>>
export function reportOf(findings: readonly ValidationIssue[]): ValidationReport
