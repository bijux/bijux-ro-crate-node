import {inferenceDataset, RDF, RDFS, OWL} from './dataset.js'

export function materializeProperties(graph, rdf, options) {
  const predicates = ['subPropertyOf', 'domain', 'range'].map(value => RDFS + value)
    .concat(['equivalentProperty', 'inverseOf', 'propertyChainAxiom'].map(value => OWL + value))
  if (!predicates.some(predicate => graph.match(null, rdf.namedNode(predicate)).size)) return
  inferenceDataset(graph, rdf, options).close([propertyRules])
}

export function propertyRules({graph, add, has, match, objects, subjects, list, append}) {
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
    const predicates = list(head)
    if (!predicates.length || predicates.some(p => p.termType !== 'NamedNode' && p.termType !== 'BlankNode')) continue
    let paths = []
    for (const q of match(null, predicates[0])) append(paths, [q.subject, q.object])
    for (const predicate of predicates.slice(1)) {
      const joined = []
      for (const [start, end] of paths)
        for (const next of objects(end, predicate)) append(joined, [start, next])
      paths = joined
    }
    for (const [start, end] of paths) add(start, property, end)
  }
}
