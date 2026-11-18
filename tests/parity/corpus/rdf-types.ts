export interface RDFCorpusInput {files: Record<string, string>}
export interface RDFCorpusEntity {
  '@id'?: string
  '@type'?: string | string[]
  [property: string]: unknown
}
export interface RDFCorpusDocument {
  '@id'?: string
  '@context': unknown[]
  '@graph': RDFCorpusEntity[]
}
export interface RDFCorpusCase {name: string; files: Record<string, string>; kind: 'mutation'}
