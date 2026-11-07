const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
const OWL = 'http://www.w3.org/2002/07/owl#'
const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'

export function materializeProperties(graph, rdf, {maxInferredQuads = 100000, maxPaths = 100000} = {}) {
  const node = value => rdf.namedNode(value)
  const rulePredicates = ['subPropertyOf', 'domain', 'range'].map(value => RDFS + value)
    .concat(['equivalentProperty', 'inverseOf', 'propertyChainAxiom'].map(value => OWL + value))
  if (!rulePredicates.some(predicate => graph.match(null, node(predicate)).size)) return
  let inferred = 0
  function list(head) {
    const predicates = [], seen = new Set()
    while (head.value !== RDF + 'nil') {
      if (seen.has(head.value)) return []
      seen.add(head.value)
      const first = [...graph.match(head, node(RDF + 'first'))]
      const rest = [...graph.match(head, node(RDF + 'rest'))]
      // OWL RL requires an actual finite RDF list, rather than interpreting an
      // arbitrary propertyChainAxiom object as an executable rule.
      if (first.length !== 1 || rest.length !== 1 || first[0].object.termType !== 'NamedNode') return []
      predicates.push(first[0].object)
      head = rest[0].object
    }
    return predicates
  }
  let changed = true
  const add = (subject, predicate, object) => {
    if (subject.termType === 'Literal') return
    const quad = rdf.quad(subject, node(predicate), object)
    if (!graph.has(quad)) {
      if (inferred >= maxInferredQuads) throw new Error('Profile property inference exceeded its inferred quad budget')
      graph.add(quad)
      inferred++
      changed = true
    }
  }
  while (changed) {
    changed = false
    for (const quad of [...graph]) {
      const {subject, predicate, object} = quad
      if (predicate.value === OWL + 'equivalentProperty') {
        add(subject, RDFS + 'subPropertyOf', object)
        add(object, RDFS + 'subPropertyOf', subject)
      }
      for (const declaration of graph.match(predicate, node(RDFS + 'subPropertyOf')))
        add(subject, declaration.object.value, object)
      for (const declaration of graph.match(predicate, node(RDFS + 'domain')))
        add(subject, TYPE, declaration.object)
      for (const declaration of graph.match(predicate, node(RDFS + 'range')))
        add(object, TYPE, declaration.object)
      for (const declaration of graph.match(predicate, node(OWL + 'inverseOf')))
        add(object, declaration.object.value, subject)
      for (const declaration of graph.match(null, node(OWL + 'inverseOf'), predicate))
        add(object, declaration.subject.value, subject)
    }
    for (const rule of [...graph.match(null, node(OWL + 'propertyChainAxiom'))]) {
      const predicates = list(rule.object)
      if (!predicates.length) continue
      const append = (paths, start, end) => {
        if (paths.length >= maxPaths) throw new Error('Profile property inference exceeded its path budget')
        paths.push([start, end])
      }
      let paths = []
      for (const q of graph.match(null, predicates[0])) append(paths, q.subject, q.object)
      for (const predicate of predicates.slice(1)) {
        const joined = []
        for (const [start, end] of paths)
          for (const q of graph.match(end, predicate)) append(joined, start, q.object)
        paths = joined
      }
      for (const [start, end] of paths) add(start, rule.subject.value, end)
    }
  }
}
