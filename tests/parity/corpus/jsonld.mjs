/** Structural inputs that distinguish an interrupted parse from rule rejection. */
export function makeJSONLDCases(minimal) {
  const cases = []
  const members = [
    ['null', null], ['boolean', false], ['integer', 0], ['string', 'text'],
    ['empty-array', []], ['null-array', [null]], ['empty-object', {}],
    ['entity-array', [{'@id': '#nested', '@type': 'bia:Contributor', name: 'Nested Person'}]],
  ]
  for (const position of ['first', 'last']) {
    for (const [name, value] of members) {
      const files = structuredClone(minimal.files)
      const document = JSON.parse(files['ro-crate-metadata.json'])
      document['@graph'][position === 'first' ? 'unshift' : 'push'](structuredClone(value))
      files['ro-crate-metadata.json'] = JSON.stringify(document)
      cases.push({name: `jsonld/graph-${position}-${name}`, files, kind: 'mutation'})
    }
  }
  return cases
}
