/** Complete, empty, cyclic and ambiguous collection reference findings. */
export function makeCollectionCases(minimal) {
  const cases = []
  const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
  const schema = 'http://schema.org/'
  for (const variant of ['complete', 'cyclic', 'empty', 'multiple-first', 'multiple-rest']) {
    const files = structuredClone(minimal.files)
    const doc = JSON.parse(files['ro-crate-metadata.json'])
    doc['@context'].push({
      chain: {'@id': 'http://www.w3.org/2002/07/owl#propertyChainAxiom', '@type': '@id'},
      first: {'@id': rdf + 'first', '@type': '@id'}, rest: {'@id': rdf + 'rest', '@type': '@id'},
    })
    doc['@graph'].push(
      {'@id': schema + 'datePublished', '@type': 'bia:Contributor', name: 'Date predicate',
        chain: variant === 'empty' ? rdf + 'nil' : '#list'},
      {'@id': schema + 'name', '@type': 'bia:Contributor', name: 'Name predicate'},
      {'@id': rdf + 'nil', '@type': 'bia:Contributor', name: 'List end'},
    )
    if (variant !== 'empty') {
      const list = {'@id': '#list', '@type': 'bia:Contributor', name: 'Property list',
        first: schema + 'name', rest: variant === 'cyclic' ? '#list' : rdf + 'nil'}
      if (variant === 'multiple-first') list.first = [schema + 'name', schema + 'datePublished']
      if (variant === 'multiple-rest') list.rest = [rdf + 'nil', '#list']
      doc['@graph'].push(list)
    }
    files['ro-crate-metadata.json'] = JSON.stringify(doc)
    cases.push({name: 'ontology/property-list-' + variant, files, kind: 'mutation'})
  }
  for (const distinct of [false, true]) {
    const files = structuredClone(minimal.files)
    const doc = JSON.parse(files['ro-crate-metadata.json'])
    const values = ['9007199254740992', distinct ? '9007199254740993' : '9007199254740992']
    doc['@graph'].push({'@id': '#large-literal', '@type': 'bia:Contributor', name: 'Large literal',
      [rdf + 'first']: values.map(value => ({'@value': value, '@type': 'http://www.w3.org/2001/XMLSchema#integer'}))})
    files['ro-crate-metadata.json'] = JSON.stringify(doc).replace(/"@value":"(900719925474099[23])"/g, '"@value":$1')
    cases.push({name: 'ontology/collection-large-integer-' + (distinct ? 'distinct' : 'duplicate'), files, kind: 'mutation'})
  }
  const literalPairs = [
    ['dateTime', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00+00:00', '2024-01-02T00:00:00Z'],
    ['date', '2024-01-01Z', '2024-01-01', '2024-01-02'],
    ['time', '00:00:00Z', '00:00:00+00:00', '01:00:00Z'],
    ['hexBinary', 'Aa', 'aa', 'ab'],
    ['base64Binary', 'Y Q==', 'YQ==', 'Yg=='],
    ['duration', 'P12M', 'P1Y', 'P2Y'],
    ['dayTimeDuration', 'P1D', 'PT24H', 'PT25H'],
    ['yearMonthDuration', 'P12M', 'P1Y', 'P2Y'],
  ]
  const addLiterals = (name, datatype, values) => {
    const files = structuredClone(minimal.files)
    const document = JSON.parse(files['ro-crate-metadata.json'])
    document['@context'].push({first: {'@id': rdf + 'first'}})
    document['@graph'][2].first = values.map(value => ({'@value': value,
      '@type': 'http://www.w3.org/2001/XMLSchema#' + datatype}))
    files['ro-crate-metadata.json'] = JSON.stringify(document)
    cases.push({name: 'ontology/collection-literal-' + name, files, kind: 'mutation'})
  }
  for (const [type, first, equivalent, distinct] of literalPairs) {
    addLiterals(type + '-equivalent', type, [first, equivalent])
    addLiterals(type + '-distinct', type, [first, distinct])
  }
  addLiterals('dateTime-offset-identity', 'dateTime', ['2024-01-01T00:00:00Z', '2024-01-01T01:00:00+01:00'])
  addLiterals('time-offset-identity', 'time', ['00:00:00Z', '01:00:00+01:00'])
  addLiterals('base64-invalid-padding', 'base64Binary', ['YQ', 'YQ='])
  addLiterals('date-invalid-duplicate', 'date', ['2024-02-30', '2024-02-30'])
  addLiterals('duration-month-scale', 'duration', ['P1.50M', 'P1.5M'])
  addLiterals('duration-negative-calendar-and-days', 'duration', ['-P1Y1D'])
  for (const [name, value] of [
    ['integer-signed-digit-limit', '+' + '0'.repeat(4300)],
    ['integer-signed-digit-overflow', '+' + '0'.repeat(4301)],
    ['integer-separated-digit-limit', '0_'.repeat(4299) + '0'],
    ['integer-separated-digit-overflow', '0_'.repeat(4300) + '0'],
  ]) addLiterals(name, 'integer', [value, '0'])
  for (const type of ['integer', 'decimal', 'float', 'double'])
    addLiterals(type + '-unrecognized-unicode-digits', type, [String.fromCodePoint(0x10d40), type === 'float' || type === 'double' ? '0.0' : '0'])
  return cases
}
