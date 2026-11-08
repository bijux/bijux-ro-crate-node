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
