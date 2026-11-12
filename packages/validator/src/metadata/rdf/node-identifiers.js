import {jsonld} from '../jsonld.js'

/** Preserve RDFLib identifier kinds without aliasing generated list/node IDs. */
export function referenceNodeIdentifiers(expanded) {
  const serialized = JSON.stringify(expanded)
  let bareIdentifier = 'urn:bijux:rdf:bare-blank-prefix'
  while (serialized.includes(bareIdentifier)) bareIdentifier += '-'
  const reserved = new Map()
  const reserve = value => {
    if (typeof value === 'string' && value.startsWith('_:')) reserved.set(value, value)
  }
  function visit(value) {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (key === '@value') continue
      reserve(key)
      if (key === '@id' || key === '@type')
        for (const id of Array.isArray(child) ? child : [child]) reserve(id)
      visit(child)
    }
  }
  visit(expanded)
  const issuer = new jsonld.util.IdentifierIssuer('_:b', reserved)
  const next = issuer.getId.bind(issuer)
  issuer.getId = old => {
    // RDFLib treats the bare prefix as a URIRef rather than an empty BNode.
    if (old === '_:') return bareIdentifier
    if (old) return old
    let id
    do {id = next()} while (reserved.has(id))
    return id
  }
  return {issuer, restoreBareIdentifier(dataset) {
    for (const quad of dataset) {
      for (const term of [quad.subject, quad.predicate, quad.object, quad.graph]) {
        if (term.value === bareIdentifier) term.value = '_:'
      }
    }
  }}
}

/** Explicit lexical IDs choose URIRef before context expansion in RDFLib. */
export function referenceIdentifierKinds() {
  const names = new Set()
  let markers
  return {
    explicit(raw, expanded) {
      if (typeof raw !== 'string' || raw.startsWith('_:') ||
          typeof expanded !== 'string' || !expanded.startsWith('_:')) return expanded
      names.add(expanded)
      return markers?.get(expanded) ?? expanded
    },
    reserve(expanded) {
      if (!names.size) return false
      const serialized = JSON.stringify(expanded)
      let namespace = 'urn:bijux:rdf:context-identifier'
      while (serialized.includes(namespace)) namespace += '-'
      markers = new Map([...names].map((name, index) => [name, namespace + '-' + index]))
      return true
    },
    restore(dataset) {
      if (!markers) return
      const names = new Map([...markers].map(([name, marker]) => [marker, name]))
      for (const quad of dataset) for (const term of [quad.subject, quad.predicate, quad.object, quad.graph])
        if (term.termType === 'NamedNode' && names.has(term.value)) term.value = names.get(term.value)
    },
  }
}
