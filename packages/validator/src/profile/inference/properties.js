import {inferenceDataset, RDF, RDFS, OWL} from './dataset.js'

export function materializeProperties(graph, rdf, options) {
  const predicates = ['subPropertyOf', 'domain', 'range'].map(value => RDFS + value)
    .concat(['equivalentProperty', 'inverseOf', 'propertyChainAxiom'].map(value => OWL + value))
  if (!predicates.some(predicate => graph.match(null, rdf.namedNode(predicate)).size)) return
  inferenceDataset(graph, rdf, options).close([propertyRules])
}

export function propertyRules({graph, add, has, match, objects, subjects, collection, termMap, append}) {
  for (const {subject: s, predicate: p, object: o} of [...graph]) {
    const predicate = p.termType === 'NamedNode' ? p.value : null
    if (predicate === OWL + 'equivalentProperty' && !s.equals(o)) {
      add(s, RDFS + 'subPropertyOf', o)
      add(o, RDFS + 'subPropertyOf', s)
    }
    for (const parent of objects(p, RDFS + 'subPropertyOf')) add(s, parent, o)
    for (const domain of objects(p, RDFS + 'domain')) add(s, RDF + 'type', domain)
    for (const range of objects(p, RDFS + 'range')) add(o, RDF + 'type', range)
    for (const inverse of objects(p, OWL + 'inverseOf')) add(o, inverse, s)
    for (const inverse of subjects(OWL + 'inverseOf', p)) add(o, inverse, s)
    if (has(p, RDF + 'type', OWL + 'SymmetricProperty')) add(o, p, s)
    if (has(p, RDF + 'type', OWL + 'TransitiveProperty'))
      for (const end of objects(o, p)) add(s, p, end)
    if (has(p, RDF + 'type', OWL + 'FunctionalProperty'))
      for (const other of objects(s, p)) if (!o.equals(other)) add(o, OWL + 'sameAs', other)
    if (has(p, RDF + 'type', OWL + 'InverseFunctionalProperty'))
      for (const other of subjects(p, o)) if (!s.equals(other)) add(s, OWL + 'sameAs', other)
    if (predicate === RDFS + 'subPropertyOf' && !s.equals(o))
      for (const parent of objects(o, RDFS + 'subPropertyOf'))
        if (!s.equals(parent)) add(s, RDFS + 'subPropertyOf', parent)
  }
  for (const {subject: property, object: head} of [...match(null, OWL + 'propertyChainAxiom')]) {
    const operand = collection(head), terms = termMap(), states = [], visited = new Set(), outputs = [], completed = new Set()
    const id = term => {
      if (!terms.has(term)) terms.set(term, terms.size)
      return terms.get(term)
    }
    const enqueue = (cell, start, end) => {
      const pair = id(start) + ':' + id(end)
      if (operand.isNil(cell)) {
        if (!completed.has(pair)) {completed.add(pair); append(outputs, [start, end])}
        if (!operand.hasTransitions(cell)) return
      }
      const key = cell + ':' + pair
      if (visited.has(key)) return
      visited.add(key); append(states, [cell, start, end])
    }
    const propertyTerm = term => term.termType === 'NamedNode' || term.termType === 'BlankNode'
    // Initial transitions consume a graph edge, so an empty nil witness never
    // invents a reflexive property assertion. Later nil states may continue.
    for (const [predicate, tail] of operand.transitions(operand.start)) {
      if (!propertyTerm(predicate)) continue
      for (const q of match(null, predicate)) enqueue(tail, q.subject, q.object)
    }
    for (let i = 0; i < states.length; i++) {
      const [cell, start, end] = states[i]
      for (const [predicate, tail] of operand.transitions(cell)) {
        if (!propertyTerm(predicate)) continue
        for (const next of objects(end, predicate)) enqueue(tail, start, next)
      }
    }
    for (const [start, end] of outputs) add(start, property, end)
  }
}
