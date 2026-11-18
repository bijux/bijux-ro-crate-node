import type {CorpusDocument, CorpusInput} from './types.js'

export function makeNonfiniteCases(minimal: CorpusInput) {
  const cases = []
  for (const token of ['NaN', 'Infinity', '-Infinity']) {
    for (const field of ['name', 'yearPublished', 'dateModified', 'datePublished', 'customNumber']) {
      const files = structuredClone(minimal.files)
      const doc: CorpusDocument = JSON.parse(files['ro-crate-metadata.json'])
      const study = doc['@graph'].find(e => e['@id'] === './')!
      if (field === 'name' || field === 'yearPublished') {
        study.relatedPublication = [{'@id': '#nonfinite-publication'}]
        doc['@graph'].push({'@id': '#nonfinite-publication', '@type': 'bia:Publication', [field]: '__number__'})
      } else {
        if (field === 'customNumber') doc['@context'].push({customNumber: 'http://example.org/customNumber'})
        study[field] = '__number__'
      }
      files['ro-crate-metadata.json'] = JSON.stringify(doc).replace('"__number__"', token)
      cases.push({name: `nonfinite/${field}-${token}`, files, kind: 'mutation'})
    }
  }
  return cases
}
