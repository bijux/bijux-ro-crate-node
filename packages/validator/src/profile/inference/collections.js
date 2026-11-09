const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'

/** Return members only when the complete OWL LIST antecedent has one supported path. */
export function collectionItems(head, {objects, rdf, maxPaths}) {
  if (head == null) return []
  const nil = rdf.namedNode(RDF + 'nil'), cells = rdf.termMap()
  const read = cell => {
    if (!cells.has(cell)) cells.set(cell, {
      first: objects(cell, RDF + 'first'), rest: objects(cell, RDF + 'rest'),
    })
    return cells.get(cell)
  }
  const append = (terms, value) => {
    if (terms.length >= maxPaths) throw new Error('Profile inference exceeded its path budget')
    terms.push(value)
  }
  const terms = [], seen = rdf.termMap()
  let current = head
  while (current != null) {
    const {first, rest} = read(current)
    if (current.equals(nil)) {
      // Empty rdf:nil is a witness. Described arcs may supply additional,
      // nonempty witnesses, so inspect their reachability before deciding.
      if (first.length && rest.length) break
      return terms
    }
    if (!first.length || !rest.length) return []
    if (first.length !== 1 || rest.length !== 1) break
    if (seen.has(current)) return []
    seen.set(current, true)
    append(terms, first[0])
    current = rest[0]
  }

  // Restrict branches to cells which can actually reach the terminator.
  // Missing or purely cyclic tails cannot supply any LIST witness.
  const reachable = rdf.termMap(), parents = rdf.termMap(), complete = rdf.termMap()
  const pending = [head], ready = []
  let members = 0, links = 0
  while (pending.length) {
    const cell = pending.pop()
    if (cell == null || reachable.has(cell)) continue
    const entry = read(cell)
    reachable.set(cell, entry)
    if (cell.equals(nil)) {complete.set(cell, true); ready.push(cell)}
    if (!entry.first.length || !entry.rest.length) continue
    members += entry.first.length
    links += entry.rest.length
    if (members > maxPaths || links > maxPaths) throw new Error('Profile inference exceeded its path budget')
    for (const tail of entry.rest) {
      if (!parents.has(tail)) parents.set(tail, [])
      parents.get(tail).push(cell)
      pending.push(tail)
    }
  }
  for (let index = 0; index < ready.length; index++) {
    for (const cell of parents.get(ready[index]) ?? []) {
      if (complete.has(cell)) continue
      complete.set(cell, true)
      ready.push(cell)
    }
  }
  if (!complete.has(head)) return []
  const result = []
  current = head
  while (true) {
    const {first, rest} = reachable.get(current)
    const tails = rest.filter(tail => complete.has(tail))
    if (current.equals(nil)) {
      if (first.length && tails.length)
        throw new Error('Profile inference cannot resolve additional collection witnesses through rdf:nil')
      return result
    }
    if (first.length !== 1 || tails.length !== 1)
      throw new Error('Profile inference cannot resolve branching RDF collection witnesses')
    append(result, first[0])
    current = tails[0]
  }
}
