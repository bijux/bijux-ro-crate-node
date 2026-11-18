export interface ManifestCorpusInput {files: Record<string, string>}
export interface ManifestCorpusDocument {
  '@graph': Array<{'@id'?: string; '@type'?: string | string[]; [property: string]: unknown}>
}
export interface ManifestCorpusCase {name: string; files: Record<string, string>; kind: 'boundary'}
