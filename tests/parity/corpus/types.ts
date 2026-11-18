export interface CorpusInput {files: Record<string, string>}
export interface CorpusEntity {
  '@id'?: string
  '@type'?: string | string[]
  [property: string]: unknown
}
export interface CorpusDocument {
  '@graph': CorpusEntity[]
  '@context': unknown[]
}
