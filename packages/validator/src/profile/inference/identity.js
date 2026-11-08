import {RDF, OWL} from './dataset.js'

export function identityRules({graph, add, has, match, objects, subjects, list}) {
  // Equality is observable through user restrictions and property chains, even
  // when a term is only equal to itself. Newly inferred terms need it too.
  for (const {subject, predicate, object} of [...graph]) {
    for (const term of [subject, predicate, object]) add(term, OWL + 'sameAs', term)
  }
  for (const {subject: a, object: b} of [...match(null, OWL + 'sameAs')]) {
    if (a.equals(b)) continue
    add(b, OWL + 'sameAs', a)
    for (const c of objects(b, OWL + 'sameAs')) add(a, OWL + 'sameAs', c)
    for (const q of [...graph]) {
      if (q.subject.equals(a)) add(b, q.predicate, q.object)
      if (q.predicate.equals(a)) add(q.subject, b, q.object)
      if (q.object.equals(a)) add(q.subject, q.predicate, b)
    }
  }
  for (const {subject: cls, object: head} of [...match(null, OWL + 'hasKey')]) {
    const properties = list(head)
    if (!properties.length) continue
    const instances = subjects(RDF + 'type', cls)
    for (const a of instances) {
      if (!properties.every(p => objects(a, p).length)) continue
      for (const b of instances) {
        if (a.equals(b) || has(a, OWL + 'sameAs', b)) continue
        // owlrl 7.1.4 checks all but the last key property. Preserve the pinned
        // implementation's behavior rather than silently correcting its rule.
        if (properties.slice(0, -1).every(p => objects(a, p).some(v => has(b, p, v)))) add(a, OWL + 'sameAs', b)
      }
    }
  }
}
