import type {ValidationIssue} from '@bijux/ro-crate-core'

interface Term { termType: string; value: string; datatype?: {value: string} | null; language?: string | null }
interface Quad { subject: Term; predicate: {value: string}; object: Term }

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
// rdfDataset has already normalized each term according to its native value.
// Parsing native numeric spellings again would change their RDFLib identity.
const termKey = (term: Term) => JSON.stringify([term.termType, term.value, term.datatype?.value, term.language?.toLowerCase()])

/** Reject explicit ambiguous cells before profile inference can select an arbitrary arc. */
export function checkCollections(dataset: Iterable<Quad>, issues: ValidationIssue[]) {
  let ambiguous = false
  for (const predicate of [RDF + 'first', RDF + 'rest']) {
    const cells = new Map<string, Set<string>>()
    for (const quad of dataset) {
      if (quad.predicate.value !== predicate) continue
      const cell = termKey(quad.subject)
      if (!cells.has(cell)) cells.set(cell, new Set())
      cells.get(cell)!.add(termKey(quad.object))
    }
    if ([...cells.values()].some(values => values.size > 1)) {
      issues.push({severity: 40, message: `Ambiguous RDF collection: multiple values for ${predicate}.`, location_description: null})
      ambiguous = true
    }
  }
  return ambiguous
}
