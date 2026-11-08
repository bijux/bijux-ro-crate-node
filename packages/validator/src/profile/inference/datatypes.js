import {RDF, RDFS, OWL} from './dataset.js'
import {datatypeLexicalError, UnrecordedDatatypeConversion} from './datatype-lexical.js'
import datatypes from './datatypes.json' with {type: 'json'}

const recognized = new Set(datatypes.recognized)

/** Seed locked owlrl datatype facts before the cooperating rule closure. */
export function materializeDatatypes({graph, node, add, termMap}) {
  const initial = [...graph]
  const implicit = termMap(), explicit = termMap()
  const used = new Set()
  const append = (resource, datatype) => {
    if (!explicit.has(resource)) explicit.set(resource, termMap())
    explicit.get(resource).set(datatype, true)
  }
  const subsumptions = (value, datatype) => {
    for (const parent of datatypes.subsumptions[datatype] ?? []) {
      used.add(parent)
      add(value, RDF + 'type', node(parent))
      add(node(parent), RDF + 'type', node(RDFS + 'Datatype'))
    }
  }
  for (const {object} of initial) {
    if (object.termType === 'Literal' && !object.language && recognized.has(object.datatype.value)) {
      implicit.set(object, object.datatype)
      used.add(object.datatype.value)
    }
  }
  for (const [literal, datatype] of implicit) add(literal, RDF + 'type', datatype)
  for (const {subject, predicate, object} of initial) {
    if (predicate.termType === 'NamedNode' && predicate.value === RDF + 'type' &&
        object.termType === 'NamedNode' && recognized.has(object.value)) {
      used.add(object.value)
      if (!implicit.has(subject)) append(subject, object)
    }
  }
  // The pinned initializer stores resource terms in these sets as well as
  // datatype IRIs. Equality closure later exposes their Datatype membership.
  for (const {subject, predicate, object} of initial) {
    if (predicate.termType !== 'NamedNode' || predicate.value !== OWL + 'sameAs') continue
    if (implicit.has(object)) append(subject, implicit.get(object))
    if (explicit.has(object)) append(subject, object)
    if (explicit.has(subject)) append(object, subject)
  }
  for (const datatype of recognized) add(node(datatype), RDF + 'type', node(RDFS + 'Datatype'))
  for (const types of explicit.values())
    for (const datatype of types.keys()) add(datatype, RDF + 'type', node(RDFS + 'Datatype'))
  for (const [resource, types] of explicit)
    for (const datatype of types.keys()) subsumptions(resource, datatype.value)
  for (const [literal, datatype] of implicit) subsumptions(literal, datatype.value)
  // Recognition alone does not activate the reference's disjointness axioms.
  for (const [left, predicate, right] of datatypes.disjointness)
    if (used.has(left) && used.has(right)) add(node(left), predicate, node(right))
}

/** Only literals present before datatype entailment undergo lexical checks. */
export function datatypeErrorMessages({graph}) {
  const messages = new Set()
  for (const {object} of graph) {
    if (object.termType !== 'Literal' || !recognized.has(object.datatype.value)) continue
    try {
      if (datatypeLexicalError(object))
        messages.add(`Lexical value of the literal '${object.value}' does not match its datatype (${object.datatype.value})`)
    } catch (error) {
      // Only ValueError creates a graph error upstream. Keep running the other
      // required checks when its converter instead crashes without a finding.
      if (!(error instanceof UnrecordedDatatypeConversion)) throw error
    }
  }
  return messages
}
