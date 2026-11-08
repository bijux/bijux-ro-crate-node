import axioms from './axioms.json' with {type: 'json'}

/** Seed the built-in class and annotation facts from the locked OWL closure. */
export function materializeAxioms({node, add}) {
  for (const [subject, predicate, object] of axioms.triples)
    add(node(subject), predicate, node(object))
}
