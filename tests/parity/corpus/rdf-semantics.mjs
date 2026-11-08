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
  return cases
}
