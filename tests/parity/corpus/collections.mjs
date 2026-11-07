/** RDFLib's tolerant collection traversal can change required profile findings. */
export function makeCollectionCases(minimal) {
  const cases = []
  const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
  const schema = 'http://schema.org/'
  for (const variant of ['complete', 'cyclic', 'missing-rest', 'missing-first', 'empty', 'nil-content', 'multiple-first', 'multiple-rest']) {
    const files = structuredClone(minimal.files)
    const doc = JSON.parse(files['ro-crate-metadata.json'])
    doc['@context'].push({
      chain: {'@id': 'http://www.w3.org/2002/07/owl#propertyChainAxiom', '@type': '@id'},
      first: {'@id': rdf + 'first', '@type': '@id'}, rest: {'@id': rdf + 'rest', '@type': '@id'},
    })
    doc['@graph'].push(
      {'@id': schema + 'datePublished', '@type': 'bia:Contributor', name: 'Date predicate',
        chain: ['empty', 'nil-content'].includes(variant) ? rdf + 'nil' : '#list'},
      {'@id': schema + 'name', '@type': 'bia:Contributor', name: 'Name predicate'},
      {'@id': rdf + 'nil', '@type': 'bia:Contributor', name: 'List end'},
    )
    if (variant === 'nil-content') doc['@graph'].find(e => e['@id'] === rdf + 'nil').first = schema + 'name'
    if (!['empty', 'nil-content'].includes(variant)) {
      const list = {'@id': '#list', '@type': 'bia:Contributor', name: 'Property list'}
      if (variant !== 'missing-first') list.first = schema + 'name'
      if (variant !== 'missing-rest') list.rest = variant === 'cyclic' ? '#list' : variant === 'missing-first' ? '#tail' : rdf + 'nil'
      if (variant === 'multiple-first') list.first = [schema + 'name', schema + 'datePublished']
      if (variant === 'multiple-rest') list.rest = [rdf + 'nil', '#list']
      doc['@graph'].push(list)
      if (variant === 'missing-first') doc['@graph'].push(
        {'@id': '#tail', '@type': 'bia:Contributor', name: 'List tail', first: schema + 'name', rest: rdf + 'nil'})
    }
    files['ro-crate-metadata.json'] = JSON.stringify(doc)
    cases.push({name: 'ontology/property-list-' + variant, files, kind: 'mutation'})
  }
  return cases
}
