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
  for (const key of ['__proto__', 'hasOwnProperty', 'constructor', 'toString']) {
    for (const used of [false, true]) {
      const files = structuredClone(minimal.files)
      const document = JSON.parse(files['ro-crate-metadata.json'])
      document['@context'].push(JSON.parse(JSON.stringify({[key]: 'http://example.org/custom'})))
      if (used) Object.defineProperty(document['@graph'][2], key,
        {value: 'custom value', enumerable: true, configurable: true, writable: true})
      files['ro-crate-metadata.json'] = JSON.stringify(document)
      cases.push({name: `jsonld/context-own-key-${key}-${used ? 'used' : 'unused'}`, files, kind: 'mutation'})
    }
  }
  const completion = [
    ['propagate-false', d => d['@context'].push({'@propagate': false})],
    ['propagate-true', d => d['@context'].push({'@propagate': true})],
    ['propagate-false-true', d => d['@context'].push({'@propagate': false}, {'@propagate': true})],
    ['propagate-true-false', d => d['@context'].push({'@propagate': true}, {'@propagate': false})],
    ['propagate-false-empty', d => d['@context'].push({'@propagate': false}, {})],
    ['propagate-false-null', d => d['@context'].push({'@propagate': false}, null)],
    ['nested-propagate-false', d => { d['@graph'][2]['@context'] = {'@propagate': false} }],
    ['nested-propagate-true', d => { d['@graph'][2]['@context'] = {'@propagate': true} }],
    ['scoped-propagate-false', d => d['@context'].push({nested: {'@id': 'http://example.org/nested', '@context': {'@propagate': false}}})],
  ]
  for (const [name, value] of [['string', 'text'], ['integer', 42], ['true', true], ['false', false],
    ['null', null], ['object', {}], ['array', []]])
    completion.push(['graph-value-' + name, d => { d['@graph'] = value }])
  for (const [name, mutate] of completion) {
    const files = structuredClone(minimal.files)
    const document = JSON.parse(files['ro-crate-metadata.json'])
    mutate(document)
    files['ro-crate-metadata.json'] = JSON.stringify(document)
    cases.push({name: 'jsonld/' + name, files, kind: 'mutation'})
  }
  return cases
}
