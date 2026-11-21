export type CrateValue = string | Blob | Uint8Array | ArrayBuffer
export type CrateFiles = ReadonlyMap<string, CrateValue>
export interface CrateWorkspace {
  has(path: string): boolean
  /** Resolve a decoded local reference to a selected file, without URI or network lookup. */
  resolveFile(path: string): string | null
  readText(path: string): Promise<string>
}
