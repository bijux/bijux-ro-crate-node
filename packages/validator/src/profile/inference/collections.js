const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'

/** Finite automaton for every complete LIST witness, including cyclic spellings. */
export function collectionGraph(head, {objects, rdf, maxPaths}) {
  const nil = rdf.namedNode(RDF + 'nil'), ids = rdf.termMap(), cells = []
  const budget = length => {
    if (length > maxPaths) throw new Error('Profile inference exceeded its path budget')
  }
  const intern = term => {
    if (!ids.has(term)) {ids.set(term, cells.length); cells.push({term, parents: []})}
    return ids.get(term)
  }
  const start = head == null ? -1 : intern(head)
  let memberArcs = 0, restArcs = 0
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    cell.first = objects(cell.term, RDF + 'first')
    const rest = cell.first.length ? objects(cell.term, RDF + 'rest') : []
    if (rest.length) {
      memberArcs += cell.first.length; restArcs += rest.length
      budget(memberArcs); budget(restArcs)
    }
    cell.rest = rest.map(term => {
      const tail = intern(term)
      cells[tail].parents.push(i)
      return tail
    })
  }
  const productive = new Set(), ready = []
  for (let i = 0; i < cells.length; i++) if (cells[i].term.equals(nil)) {productive.add(i); ready.push(i)}
  for (let i = 0; i < ready.length; i++)
    for (const parent of cells[ready[i]].parents)
      if (!productive.has(parent)) {productive.add(parent); ready.push(parent)}
  let edges = 0
  for (let i = 0; i < cells.length; i++) {
    cells[i].rest = cells[i].rest.filter(tail => productive.has(tail))
    if (productive.has(i)) edges += cells[i].first.length * cells[i].rest.length
  }
  budget(edges)
  const isNil = cell => cell >= 0 && cells[cell].term.equals(nil)
  function* transitions(cell) {
    if (!productive.has(cell)) return
    for (const member of cells[cell].first)
      for (const tail of cells[cell].rest) yield [member, tail]
  }
  const reachable = [], visited = new Set()
  if (productive.has(start)) {reachable.push(start); visited.add(start)}
  for (let i = 0; i < reachable.length; i++)
    for (const [, tail] of transitions(reachable[i]))
      if (!visited.has(tail)) {visited.add(tail); reachable.push(tail)}
  const members = () => {
    const values = rdf.termMap()
    for (const cell of reachable)
      if (cells[cell].rest.length) for (const term of cells[cell].first) values.set(term, term)
    return [...values.values()]
  }
  // A distinct last predicate preserves the pinned hasKey rule's final-property
  // behavior. Every other consumer checks the same predicate at all positions.
  const accepts = (predicate, last = predicate) => {
    const seen = new Set(), pending = []
    if (productive.has(start)) {seen.add(start); pending.push(start)}
    for (let i = 0; i < pending.length; i++)
      for (const [member, tail] of transitions(pending[i])) {
        if (isNil(tail) && last(member)) return true
        if (predicate(member) && !seen.has(tail)) {seen.add(tail); pending.push(tail)}
      }
    return false
  }
  const pairs = () => {
    const terms = rdf.termMap(), pending = [], states = new Set(), results = [], found = new Set()
    const termId = term => {
      if (!terms.has(term)) terms.set(term, terms.size)
      return terms.get(term)
    }
    const enqueue = (cell, member) => {
      const id = termId(member), key = cell + ':' + id
      if (states.has(key)) return
      states.add(key); pending.push([cell, member, id]); budget(pending.length)
    }
    // Carry a member into later positions on its own witness. Members chosen
    // on mutually exclusive branches are never combined as one list.
    for (const cell of reachable)
      for (const [member, tail] of transitions(cell)) enqueue(tail, member)
    for (let i = 0; i < pending.length; i++) {
      const [cell, previous, id] = pending[i]
      for (const [member, tail] of transitions(cell)) {
        const key = id + ':' + termId(member)
        if (!found.has(key)) {found.add(key); results.push([previous, member]); budget(results.length)}
        enqueue(tail, previous)
      }
    }
    return results
  }
  const hasTransitions = cell => productive.has(cell) && cells[cell].first.length > 0 && cells[cell].rest.length > 0
  return {start, isNil, hasTransitions, transitions, members, accepts, pairs}
}
