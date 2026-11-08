import {RDF, RDFS} from './dataset.js'
import datatypes from './datatypes.json' with {type: 'json'}

const recognized = new Set(datatypes.recognized)

/** Seed locked owlrl datatype facts before the cooperating rule closure. */
export function materializeDatatypes({graph, node, add, match}) {
  const used = new Set()
  const membership = (value, datatype) => {
    used.add(datatype)
    add(value, RDF + 'type', node(datatype))
    for (const parent of datatypes.subsumptions[datatype] ?? []) {
      used.add(parent)
      add(value, RDF + 'type', node(parent))
    }
  }
  const initial = [...graph]
  for (const {object} of initial) {
    if (object.termType === 'Literal' && !object.language && recognized.has(object.datatype.value))
      membership(object, object.datatype.value)
  }
  for (const {subject, object} of [...match(null, RDF + 'type')])
    if (object.termType === 'NamedNode' && recognized.has(object.value)) membership(subject, object.value)
  for (const datatype of recognized) add(node(datatype), RDF + 'type', node(RDFS + 'Datatype'))
  // Recognition alone does not activate the reference's disjointness axioms.
  for (const [left, predicate, right] of datatypes.disjointness)
    if (used.has(left) && used.has(right)) add(node(left), predicate, node(right))
}
