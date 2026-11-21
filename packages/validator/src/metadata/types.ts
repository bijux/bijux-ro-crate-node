export type MetadataEntity = Record<string, unknown> & {'@id': string}
export interface ParsedMetadata {
  entities: Map<string, MetadataEntity>
  modelTypes: Map<string, string>
  context: Record<string, unknown>
}
