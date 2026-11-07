export function makeDatatypeCases(minimal) {
  const xsd = 'http://www.w3.org/2001/XMLSchema#'
  const tag = 'https://example.org/tag'
  const values = [
    ['typed-string', {'@value': 'value', '@type': xsd + 'string'}, xsd + 'string'],
    ['typed-integer', {'@value': '1', '@type': xsd + 'integer'}, xsd + 'integer'],
    ['typed-decimal', {'@value': '1.5', '@type': xsd + 'decimal'}, xsd + 'decimal'],
    ['typed-datetime', {'@value': '2024-01-01T00:00:00Z', '@type': xsd + 'dateTime'}, xsd + 'dateTime'],
    ['integer-subsumption', {'@value': '1', '@type': xsd + 'int'}, xsd + 'integer'],
    ['decimal-subsumption', {'@value': '1', '@type': xsd + 'integer'}, xsd + 'decimal'],
    ['plain-string-control', 'value', xsd + 'string'],
    ['untyped-value-control', {'@value': 'value'}, xsd + 'string'],
    ['language-control', {'@value': 'value', '@language': 'en'}, xsd + 'string'],
    ['unknown-datatype-control', {'@value': 'value', '@type': 'https://example.org/Unknown'}, 'https://example.org/Unknown'],
    ['unrecognized-duration-control', {'@value': 'P1D', '@type': xsd + 'duration'}, xsd + 'duration'],
    ['context-coerced-string', 'value', xsd + 'string'],
    ['without-subclass-control', {'@value': 'value', '@type': xsd + 'string'}, xsd + 'string'],
  ]
  return values.map(([name, value, datatype]) => {
    const files = structuredClone(minimal.files)
    const document = JSON.parse(files['ro-crate-metadata.json'])
    const context = {
      tag: {'@id': tag},
      onProperty: {'@id': 'http://www.w3.org/2002/07/owl#onProperty', '@type': '@id'},
      someValuesFrom: {'@id': 'http://www.w3.org/2002/07/owl#someValuesFrom', '@type': '@id'},
      subClassOf: {'@id': 'http://www.w3.org/2000/01/rdf-schema#subClassOf', '@type': '@id'},
    }
    if (name === 'context-coerced-string') context.tag['@type'] = xsd + 'string'
    document['@context'].push(context)
    const author = document['@graph'].find(e => e['@type']?.includes('bia:Contributor'))
    Object.assign(author, {tag: value, onProperty: tag, someValuesFrom: datatype})
    if (name !== 'without-subclass-control') author.subClassOf = 'http://schema.org/Dataset'
    for (const id of [tag, datatype])
      document['@graph'].push({'@id': id, '@type': ['bia:Contributor'], name: 'Referenced declaration'})
    files['ro-crate-metadata.json'] = JSON.stringify(document)
    return {name: 'datatype/' + name, files, kind: 'mutation'}
  })
}
