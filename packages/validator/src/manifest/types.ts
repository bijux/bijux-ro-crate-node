import type {MetadataEntity} from '../metadata/types.js'

export interface ManifestMetadata {
  entities: ReadonlyMap<unknown, MetadataEntity>
  modelTypes: ReadonlyMap<unknown, string | undefined>
  parserContext?: {multivalued_properties?: unknown}
}
