import type {ValidationIssue} from '@bijux/ro-crate-core'

function addReferences(value: unknown, refs: Set<string>) {
  if (!value || typeof value !== 'object') return
  if (!Array.isArray(value) && Object.keys(value).length === 1 && typeof (value as Record<string, unknown>)['@id'] === 'string') {
    // Read the property again because accessors can have observable effects.
    refs.add((value as {'@id': string})['@id'])
    return
  }
  for (const child of Object.values(value)) addReferences(child, refs)
}

export function checkConnectivity(metadata: {entities: ReadonlyMap<string, Record<string, unknown>>}, refs: Set<string>, issues: ValidationIssue[]) {
  for (const entity of metadata.entities.values()) {
    for (const [field, value] of Object.entries(entity)) {
      if (field !== '@id' && field !== '@type') addReferences(value, refs)
    }
  }
  const missing = [...metadata.entities.keys()].filter(id => id !== 'ro-crate-metadata.json' && !refs.has(id)).sort()
  if (missing.length) issues.push({
    severity: 30, location_description: null,
    message: 'Found RO-Crate objects with no inbound references across ro-crate-metadata.json and file list references: ' + missing.join(', ')
  })
}
