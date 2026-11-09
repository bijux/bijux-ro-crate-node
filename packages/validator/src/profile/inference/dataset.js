import {collectionItems} from './collections.js'

export const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
export const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
export const OWL = 'http://www.w3.org/2002/07/owl#'

/** One budget belongs to the whole closure, including cooperating rule groups. */
export function inferenceDataset(graph, rdf, {maxInferredQuads = 100000, maxPaths = 100000, literalValue = () => undefined} = {}) {
  // Generalized literal-subject and blank-predicate facts cooperate privately;
  // the caller's RDF dataset stays suitable for SHACL.
  const generalizedFacts = rdf.dataset()
  const reasoningGraph = {[Symbol.iterator]: function* () {yield* graph; yield* generalizedFacts}}
  const node = value => typeof value === 'string' ? rdf.namedNode(value) : value
  let inferred = 0, changed = false
  function* match(s, p, o) {
    p = p == null ? null : node(p)
    yield* graph.match(s, p, o)
    yield* generalizedFacts.match(s, p, o)
  }
  const add = (s, p, o) => {
    p = node(p)
    if (p.termType !== 'NamedNode' && p.termType !== 'BlankNode') return
    const target = s.termType === 'Literal' || p.termType === 'BlankNode' ? generalizedFacts : graph
    const quad = rdf.quad(s, p, o)
    if (graph.has(quad) || generalizedFacts.has(quad)) return
    if (inferred >= maxInferredQuads) throw new Error('Profile inference exceeded its inferred quad budget')
    target.add(quad)
    inferred++
    changed = true
  }
  const has = (s, p, o) => {
    const quad = rdf.quad(s, node(p), node(o))
    return graph.has(quad) || generalizedFacts.has(quad)
  }
  const objects = (s, p) => [...match(s, p)].map(q => q.object)
  const subjects = (p, o) => [...match(null, p, node(o))].map(q => q.subject)
  const list = head => collectionItems(head, {objects, rdf, maxPaths})
  const append = (paths, value) => {
    if (paths.length >= maxPaths) throw new Error('Profile inference exceeded its path budget')
    paths.push(value)
  }
  return {graph: reasoningGraph, node, add, has, objects, subjects, match, list, append, literalValue,
    termMap: () => rdf.termMap(),
    removeBlankPredicates() {
      for (const dataset of [graph, generalizedFacts])
        for (const quad of [...dataset])
          if (quad.predicate.termType === 'BlankNode') dataset.delete(quad)
    },
    close(rules) {
      do {
        changed = false
        for (const rule of rules) rule(this)
      } while (changed)
    }}
}
