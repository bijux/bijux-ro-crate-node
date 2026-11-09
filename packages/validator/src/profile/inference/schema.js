import {RDF, RDFS, OWL} from './dataset.js'

/** Schema entailments can enable restrictions in a later membership pass. */
export function schemaRules({graph, node, add, has, match, objects, subjects}) {
  for (const {subject: s, predicate: p, object: o} of [...graph]) {
    const predicate = p.termType === 'NamedNode' ? p.value : null
    if (predicate === RDF + 'type' && o.termType === 'NamedNode' && o.value === OWL + 'Class') {
      add(s, RDFS + 'subClassOf', s)
      add(s, OWL + 'equivalentClass', s)
      add(s, RDFS + 'subClassOf', node(OWL + 'Thing'))
      add(node(OWL + 'Nothing'), RDFS + 'subClassOf', s)
    } else if (predicate === RDF + 'type' && o.termType === 'NamedNode' && [OWL + 'ObjectProperty', OWL + 'DatatypeProperty', RDF + 'Property'].includes(o.value)) {
      add(s, RDFS + 'subPropertyOf', s)
      add(s, OWL + 'equivalentProperty', s)
    } else if (predicate === RDFS + 'subClassOf' && has(o, RDFS + 'subClassOf', s)) {
      add(s, OWL + 'equivalentClass', o)
    } else if (predicate === RDFS + 'subPropertyOf' && !s.equals(o) && has(o, RDFS + 'subPropertyOf', s)) {
      add(s, OWL + 'equivalentProperty', o)
    } else if ([RDFS + 'domain', RDFS + 'range'].includes(predicate)) {
      for (const parent of objects(o, RDFS + 'subClassOf')) add(s, p, parent)
      for (const child of subjects(RDFS + 'subPropertyOf', s)) add(child, p, o)
    } else if ([OWL + 'hasValue', OWL + 'someValuesFrom', OWL + 'allValuesFrom'].includes(predicate)) {
      for (const property of objects(s, OWL + 'onProperty')) {
        for (const other of subjects(OWL + 'onProperty', property))
          for (const value of objects(other, p))
            if (predicate !== OWL + 'hasValue' && has(o, RDFS + 'subClassOf', value)) add(s, RDFS + 'subClassOf', other)
        for (const other of subjects(p, o))
          for (const otherProperty of objects(other, OWL + 'onProperty'))
            if (has(property, RDFS + 'subPropertyOf', otherProperty)) {
              if (predicate === OWL + 'allValuesFrom') add(other, RDFS + 'subClassOf', s)
              else add(s, RDFS + 'subClassOf', other)
            }
      }
    }
  }
}
