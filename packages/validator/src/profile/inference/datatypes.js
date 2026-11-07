import {RDF, RDFS} from './dataset.js'
import datatypes from './datatypes.json' with {type: 'json'}

const recognized = new Set(datatypes.recognized)

/** Seed locked owlrl datatype facts before the cooperating rule closure. */
export function materializeDatatypes({graph, node, add, match}) {
  const membership = (value, datatype) => {
    add(value, RDF + 'type', node(datatype))
    for (const parent of datatypes.subsumptions[datatype] ?? [])
      add(value, RDF + 'type', node(parent))
  }
  const initial = [...graph]
  for (const {object} of initial) {
    if (object.termType === 'Literal' && !object.language && recognized.has(object.datatype.value))
      membership(object, object.datatype.value)
  }
  for (const {subject, object} of [...match(null, RDF + 'type')])
    if (recognized.has(object.value)) membership(subject, object.value)
  for (const datatype of recognized) add(node(datatype), RDF + 'type', node(RDFS + 'Datatype'))
}
