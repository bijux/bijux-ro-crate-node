import axioms from './axioms.json' with {type: 'json'}

/** Seed the built-in class and annotation facts from the locked OWL closure. */
export function materializeAxioms<T>({node, add}: {node(value: string): T; add(subject: T, predicate: string, object: T): void}) {
  for (const [subject, predicate, object] of axioms.triples)
    add(node(subject), predicate, node(object))
}
