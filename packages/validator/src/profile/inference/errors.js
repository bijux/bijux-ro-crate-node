import {RDF, OWL} from './dataset.js'

export const ERROR = 'http://www.daml.org/2002/03/agents/agent-ont#'

/** The pinned OWL rules record messages, then add graph nodes after closure. */
export function inconsistencyMessages({graph, node, has, objects, subjects, match, list, literalValue, append}) {
  const messages = new Set()
  const recorded = []
  const error = message => {
    if (!messages.has(message)) {append(recorded, message); messages.add(message)}
  }
  const text = term => term.value
  const pairs = (values, visit) => {
    for (let i = 0; i < values.length - 1; i++)
      for (let j = i + 1; j < values.length; j++) visit(values[i], values[j])
  }
  const disjointClasses = (left, right) => {
    for (const instance of subjects(RDF + 'type', left))
      if (has(instance, RDF + 'type', right))
        error(`Disjoint classes ${text(left)} and ${text(right)} have a common individual ${text(instance)}`)
  }
  for (const {subject: s, predicate: p, object: o} of graph) {
    const predicate = p.termType === 'NamedNode' ? p.value : null
    if (predicate === OWL + 'sameAs' && (has(s, OWL + 'differentFrom', o) || has(o, OWL + 'differentFrom', s)))
      error(`'sameAs' and 'differentFrom' cannot be used on the same subject-object pair: (${text(s)}, ${text(o)})`)
    if (predicate === RDF + 'type') {
      if (o.equals(node(OWL + 'Nothing'))) error(`${text(s)} is defined of type 'Nothing'`)
      if (o.equals(node(OWL + 'AllDifferent')))
        for (const head of [...objects(s, OWL + 'members'), ...objects(s, OWL + 'distinctMembers')])
          pairs(list(head), (a, b) => {
            if (has(a, OWL + 'sameAs', b) || has(b, OWL + 'sameAs', a))
              error(`'sameAs' and 'AllDifferent' cannot be used on the same subject-object pair: (${text(a)}, ${text(b)})`)
          })
      if (o.equals(node(OWL + 'IrreflexiveProperty')))
        for (const q of match(null, s))
          if (q.subject.equals(q.object)) error(`Irreflexive property used on ${text(q.subject)} with ${text(s)}`)
      if (o.equals(node(OWL + 'AsymmetricProperty')))
        for (const q of match(null, s))
          if (has(q.object, s, q.subject)) error(`Erroneous usage of asymmetric property ${text(s)} on ${text(q.subject)} and ${text(q.object)}`)
      if (o.equals(node(OWL + 'AllDisjointProperties')))
        for (const head of objects(s, OWL + 'members'))
          pairs(list(head), (a, b) => {
            for (const q of match(null, a)) if (has(q.subject, b, q.object))
              error(`Disjoint properties in an 'AllDisjointProperties' are not really disjoint: (${text(q.subject)}, ${text(a)},${text(q.object)}) and (${text(q.subject)},${text(b)},${text(q.object)})`)
          })
      if (o.equals(node(OWL + 'AllDisjointClasses')))
        for (const head of objects(s, OWL + 'members')) pairs(list(head), disjointClasses)
    } else if (predicate === OWL + 'propertyDisjointWith') {
      for (const q of match(null, s)) if (has(q.subject, o, q.object))
        error(`Erroneous usage of disjoint properties ${text(s)} and ${text(o)} on ${text(q.subject)} and ${text(q.object)}`)
    } else if (predicate === OWL + 'sourceIndividual') {
      for (const property of objects(s, OWL + 'assertionProperty'))
        for (const [target, label] of [['targetIndividual', 'object'], ['targetValue', 'datatype']])
          for (const value of objects(s, OWL + target)) if (has(o, property, value))
            error(`Negative (${label}) property assertion violated for: (${text(o)}, ${text(property)}, ${text(value)})`)
    } else if (predicate === OWL + 'complementOf') {
      for (const instance of subjects(RDF + 'type', s)) if (has(instance, RDF + 'type', o))
        // The reference message identifies the complement class as the element.
        error(`Violation of complementarity for classes ${text(s)} and ${text(o)} on element ${text(o)}`)
    } else if (predicate === OWL + 'disjointWith') disjointClasses(s, o)
    else if ([OWL + 'maxCardinality', OWL + 'maxQualifiedCardinality'].includes(predicate) &&
      o.termType === 'Literal' && literalValue(o) === 0) {
      for (const property of objects(s, OWL + 'onProperty'))
        for (const instance of subjects(RDF + 'type', s))
          for (const value of objects(instance, property)) {
            if (predicate === OWL + 'maxCardinality') error(`Erroneous usage of maximum cardinality with ${text(s)} and ${text(value)}`)
            else for (const cls of objects(s, OWL + 'onClass'))
              if (cls.equals(node(OWL + 'Thing')) || has(value, RDF + 'type', cls))
                error(`Erroneous usage of maximum qualified cardinality with ${text(s)}, ${text(cls)} and ${text(value)}`)
          }
    }
  }
  return messages
}

/** Generated labels stay reproducible without colliding with input blank nodes. */
export function emitInconsistencies(inference, rdf, messages, rootURL = 'file:///crate/') {
  const occupied = [...inference.graph].flatMap(q => [q.subject, q.predicate, q.object])
    .filter(term => term.termType === 'BlankNode').map(term => term.value)
  let namespace = 'owl-error-'
  while (occupied.some(value => value.startsWith(namespace))) namespace += '-'
  const stable = message => message.replaceAll(rootURL, 'crate:/')
  const ordered = [...messages].map(message => ({message, key: Array.from(stable(message), char => char.codePointAt(0))}))
    .sort((a, b) => {
      for (let i = 0; i < Math.min(a.key.length, b.key.length); i++)
        if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i]
      return a.key.length - b.key.length
    }).map(item => item.message)
  const emitted = []
  for (const [index, message] of ordered.entries()) {
    const node = rdf.blankNode(namespace + index)
    inference.add(node, RDF + 'type', rdf.namedNode(ERROR + 'ErrorMessage'))
    inference.add(node, ERROR + 'error', rdf.literal(message, rdf.namedNode('')))
    emitted.push({node: node.value, message})
  }
  return emitted
}
