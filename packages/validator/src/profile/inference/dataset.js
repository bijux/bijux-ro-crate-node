export const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
export const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
export const OWL = 'http://www.w3.org/2002/07/owl#'

/** One budget belongs to the whole closure, including cooperating rule groups. */
export function inferenceDataset(graph, rdf, {maxInferredQuads = 100000, maxPaths = 100000} = {}) {
  const node = value => typeof value === 'string' ? rdf.namedNode(value) : value
  let inferred = 0, changed = false
  const match = (s, p, o) => graph.match(s, p == null ? null : node(p), o)
  const add = (s, p, o) => {
    p = node(p)
    if (s.termType === 'Literal' || p.termType !== 'NamedNode') return
    const quad = rdf.quad(s, p, o)
    if (graph.has(quad)) return
    if (inferred >= maxInferredQuads) throw new Error('Profile inference exceeded its inferred quad budget')
    graph.add(quad)
    inferred++
    changed = true
  }
  const has = (s, p, o) => graph.has(rdf.quad(s, node(p), node(o)))
  const objects = (s, p) => [...match(s, p)].map(q => q.object)
  const subjects = (p, o) => [...match(null, p, node(o))].map(q => q.subject)
  function list(head) {
    const terms = [], seen = new Set()
    while (!head.equals(node(RDF + 'nil'))) {
      const key = head.termType + ':' + head.value
      if (seen.has(key)) return []
      seen.add(key)
      const first = objects(head, RDF + 'first'), rest = objects(head, RDF + 'rest')
      if (first.length !== 1 || rest.length !== 1) return []
      if (terms.length >= maxPaths) throw new Error('Profile inference exceeded its path budget')
      terms.push(first[0])
      head = rest[0]
    }
    return terms
  }
  const append = (paths, value) => {
    if (paths.length >= maxPaths) throw new Error('Profile inference exceeded its path budget')
    paths.push(value)
  }
  return {graph, node, add, has, objects, subjects, match, list, append,
    close(rules) {
      do {
        changed = false
        for (const rule of rules) rule(this)
      } while (changed)
    }}
}
