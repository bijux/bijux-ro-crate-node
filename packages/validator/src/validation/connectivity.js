function addReferences(value, refs) {
  if (!value || typeof value !== 'object') return
  if (!Array.isArray(value) && Object.keys(value).length === 1 && typeof value['@id'] === 'string') {
    refs.add(value['@id'])
    return
  }
  for (const child of Object.values(value)) addReferences(child, refs)
}

export function checkConnectivity(metadata, refs, issues) {
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
