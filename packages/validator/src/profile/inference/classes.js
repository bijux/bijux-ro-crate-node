import {RDF, RDFS, OWL} from './dataset.js'

export function classMembership({add, match, objects}) {
  for (const q of [...match(null, RDF + 'type')])
    for (const parent of objects(q.object, RDFS + 'subClassOf')) add(q.subject, RDF + 'type', parent)
}

/** Class membership needed by the pinned profile's SHACL targets and constraints. */
export function classRules({graph, node, add, has, match, objects, subjects, collection, termMap, literalValue}) {
  for (const {subject: s, predicate: p, object: o} of [...graph]) {
    const predicate = p.termType === 'NamedNode' ? p.value : null
    if (predicate === RDF + 'type') {
      for (const parent of objects(o, RDFS + 'subClassOf')) add(s, RDF + 'type', parent)
    } else if (predicate === RDFS + 'subClassOf' && !s.equals(o)) {
      for (const parent of objects(o, RDFS + 'subClassOf'))
        if (!s.equals(parent)) add(s, RDFS + 'subClassOf', parent)
    } else if (predicate === OWL + 'equivalentClass' && !s.equals(o)) {
      add(s, RDFS + 'subClassOf', o)
      add(o, RDFS + 'subClassOf', s)
    } else if (predicate === OWL + 'intersectionOf') {
      const operand = collection(o), candidates = termMap()
      for (const cls of operand.members()) {
        add(s, RDFS + 'subClassOf', cls)
        for (const instance of subjects(RDF + 'type', cls)) candidates.set(instance, instance)
      }
      for (const instance of candidates.values())
        if (operand.accepts(cls => has(instance, RDF + 'type', cls))) add(instance, RDF + 'type', s)
    } else if (predicate === OWL + 'unionOf') {
      for (const cls of collection(o).members()) add(cls, RDFS + 'subClassOf', s)
    } else if (predicate === OWL + 'oneOf') {
      for (const instance of collection(o).members()) add(instance, RDF + 'type', s)
    } else if (predicate === OWL + 'someValuesFrom') {
      for (const property of objects(s, OWL + 'onProperty'))
        for (const q of match(null, property))
          if (o.equals(node(OWL + 'Thing')) || has(q.object, RDF + 'type', o)) add(q.subject, RDF + 'type', s)
    } else if (predicate === OWL + 'allValuesFrom') {
      for (const property of objects(s, OWL + 'onProperty'))
        for (const instance of subjects(RDF + 'type', s))
          for (const value of objects(instance, property)) add(value, RDF + 'type', o)
    } else if (predicate === OWL + 'hasValue') {
      for (const property of objects(s, OWL + 'onProperty')) {
        for (const instance of subjects(RDF + 'type', s)) add(instance, property, o)
        for (const instance of subjects(property, o)) add(instance, RDF + 'type', s)
      }
    } else if ([OWL + 'maxCardinality', OWL + 'maxQualifiedCardinality'].includes(predicate) &&
               o.termType === 'Literal' && literalValue(o) === 1) {
      for (const property of objects(s, OWL + 'onProperty'))
        for (const instance of subjects(RDF + 'type', s)) {
          const classes = predicate === OWL + 'maxQualifiedCardinality' ? objects(s, OWL + 'onClass') : [node(OWL + 'Thing')]
          for (const cls of classes) {
            const values = objects(instance, property).filter(v => cls.equals(node(OWL + 'Thing')) || has(v, RDF + 'type', cls))
            for (const a of values) for (const b of values) if (!a.equals(b)) add(a, OWL + 'sameAs', b)
          }
        }
    }
  }
}
