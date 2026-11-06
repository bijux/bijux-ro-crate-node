export type CrateValue = string | Blob | Uint8Array | ArrayBuffer
export type CrateFiles = ReadonlyMap<string, CrateValue>
export interface CrateWorkspace {
  has(path: string): boolean
  readText(path: string): Promise<string>
}
export function createWorkspace(files: CrateFiles): CrateWorkspace
export function snapshotFiles(files: CrateFiles): Map<string, CrateValue>
export function fromDirectory(files: Iterable<File> | FileList): Map<string, File>
