import {literalKey} from './literals/identity.js'

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const termKey = term => term.termType === 'Literal' ? literalKey(term) : JSON.stringify([term.termType, term.value])

/** Reject explicit ambiguous cells before profile inference can select an arbitrary arc. */
export function checkCollections(dataset, issues) {
  let ambiguous = false
  for (const predicate of [RDF + 'first', RDF + 'rest']) {
    const cells = new Map()
    for (const quad of dataset) {
      if (quad.predicate.value !== predicate) continue
      const cell = termKey(quad.subject)
      if (!cells.has(cell)) cells.set(cell, new Set())
      cells.get(cell).add(termKey(quad.object))
    }
    if ([...cells.values()].some(values => values.size > 1)) {
      issues.push({severity: 40, message: `Ambiguous RDF collection: multiple values for ${predicate}.`, location_description: null})
      ambiguous = true
    }
  }
  return ambiguous
}
