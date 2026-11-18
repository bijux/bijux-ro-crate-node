import type {RDFCorpusCase, RDFCorpusDocument, RDFCorpusInput} from './rdf-types.js'

/** Ontology declarations must reach the same profile/model path as Python. */
export function makeOntologyCases(minimal: RDFCorpusInput) {
  const cases: RDFCorpusCase[] = []
  const add = (name: string, mutate: (document: RDFCorpusDocument) => void) => {
    const files = structuredClone(minimal.files)
    const doc: RDFCorpusDocument = JSON.parse(files['ro-crate-metadata.json'])
    mutate(doc)
    files['ro-crate-metadata.json'] = JSON.stringify(doc)
    cases.push({name: 'ontology/' + name, files, kind: 'mutation'})
  }
  for (const property of ['sameAs', 'differentFrom', 'disjointWith', 'unionOf', 'intersectionOf', 'oneOf', 'complementOf']) {
    add('declaration-' + property, doc => {
      doc['@context'].push({axiom: {'@id': 'http://www.w3.org/2002/07/owl#' + property, '@type': '@id'}})
      doc['@graph'].find(e => e['@id'] === './')!.axiom = 'file_list.tsv'
    })
  }
  for (const type of ['TransitiveProperty', 'SymmetricProperty', 'FunctionalProperty', 'InverseFunctionalProperty',
                       'ObjectProperty', 'DatatypeProperty', 'AnnotationProperty']) {
    add('unregistered-property-' + type, doc => {
      doc['@context'].push({owl: 'http://www.w3.org/2002/07/owl#'})
      doc['@graph'].push({'@id': 'http://bia/name', '@type': 'owl:' + type})
    })
    add('registered-property-' + type, doc => {
      const property = doc['@graph'][2];
      (property['@type'] as string[]).push('http://www.w3.org/2002/07/owl#' + type)
      doc['@context'].push({relationship: {'@id': property['@id'], '@type': '@id'}})
      doc['@graph'].find(e => e['@id'] === './')!.relationship = [{'@id': 'file_list.tsv'}, {'@id': property['@id']}]
      doc['@graph'].find(e => e['@id'] === 'file_list.tsv')!.relationship = {'@id': './'}
    })
  }
  for (const target of ['Dataset', 'CreativeWork', 'MediaObject']) {
    add('thing-subclass-' + target, doc => {
      doc['@context'].push({subClassOf: {'@id': 'http://www.w3.org/2000/01/rdf-schema#subClassOf', '@type': '@id'}})
      doc['@graph'].push({'@id': 'http://www.w3.org/2002/07/owl#Thing', '@type': ['bia:Contributor'],
        name: 'Class declaration', subClassOf: 'http://schema.org/' + target})
    })
  }
  return cases
}
