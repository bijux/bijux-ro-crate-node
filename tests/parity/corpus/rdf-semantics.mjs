/** RDF construction boundaries that affect the complete Python parser result. */
export function makeRDFSemanticCases(minimal) {
  const cases = []
  const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
  const xsd = 'http://www.w3.org/2001/XMLSchema#'
  const add = (name, mutate) => {
    const files = structuredClone(minimal.files)
    const document = JSON.parse(files['ro-crate-metadata.json'])
    mutate(document)
    files['ro-crate-metadata.json'] = JSON.stringify(document)
    cases.push({name: 'rdf/' + name, files, kind: 'mutation'})
  }
  for (const [name, values] of [
    ['invalid-distinct', ['invalid-one', 'invalid-two']],
    ['invalid-duplicate', ['invalid-one', 'invalid-one']],
    ['precise-distinct', ['1.2345678901234567', '1.234567890123457']],
    ['signed-zero', ['-0.0', '0.0']],
  ]) {
    for (const coerced of [false, true]) add('double-' + (coerced ? 'context-' : 'explicit-') + name, document => {
      document['@context'].push({first: {'@id': rdf + 'first', ...(coerced ? {'@type': xsd + 'double'} : {})}})
      document['@graph'][2].first = coerced ? values : values.map(value => ({'@value': value, '@type': xsd + 'double'}))
    })
  }
  for (const distinct of [false, true]) add('double-native-precision-' + (distinct ? 'distinct' : 'duplicate'), document => {
    document['@context'].push({first: {'@id': rdf + 'first'}})
    document['@graph'][2].first = [1.2345678901234567, distinct ? 1.234567890123457 : 1.2345678901234567]
  })
  for (const explicit of [false, true]) add('reflexive-identity-' + (explicit ? 'explicit' : 'inferred'), document => {
    const owl = 'http://www.w3.org/2002/07/owl#'
    document['@context'].push({
      onProperty: {'@id': owl + 'onProperty', '@type': '@id'},
      hasValue: {'@id': owl + 'hasValue', '@type': '@id'},
      subClassOf: {'@id': 'http://www.w3.org/2000/01/rdf-schema#subClassOf', '@type': '@id'},
      sameAs: {'@id': owl + 'sameAs', '@type': '@id'},
    })
    const author = document['@graph'].find(entity => entity['@type']?.includes('bia:Contributor'))
    Object.assign(author, {onProperty: owl + 'sameAs', hasValue: author['@id'], subClassOf: 'http://schema.org/Dataset'})
    if (explicit) author.sameAs = author['@id']
    document['@graph'].push({'@id': owl + 'sameAs', '@type': 'bia:Contributor', name: 'Identity property'})
  })
  for (const named of [false, true]) for (const value of ['control', 'undefined-reference', 'ambiguous-list']) {
    add('graph-' + (named ? 'named-' : 'default-') + value, document => {
      if (named) document['@id'] = 'urn:isolated-graph'
      if (value === 'undefined-reference') {
        document['@context'].push({tag: {'@id': 'urn:tag', '@type': '@id'}})
        document['@graph'][2].tag = 'urn:undefined'
      }
      if (value === 'ambiguous-list') {
        document['@context'].push({first: {'@id': rdf + 'first'}})
        document['@graph'][2].first = ['a', 'b']
      }
    })
  }
  return cases
}
