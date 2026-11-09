import rdf from 'rdf-validate-shacl/src/defaultEnv.js'
import {namespaceLabel} from '../../metadata/rdf/namespaces.js'
import {referenceDatatype} from '../../metadata/rdf/literals/datatype-aliases.js'

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const SAME_AS = 'http://www.w3.org/2002/07/owl#sameAs'

function compareLabels(left, right) {
  const a = Array.from(left, c => c.codePointAt(0)), b = Array.from(right, c => c.codePointAt(0))
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]
  return a.length - b.length
}

/** Render inverse-path focus values from the graph visible to report generation. */
export function inversePathFormatter(inference, quads, rootURL) {
  // Flattened class membership serves the JavaScript SHACL engine only. Python
  // reports inspect the graph after procedural rules and before that flattening.
  const facts = [...inference.graph]
  const collectionArcs = inference.collectionArcs()
  let graph
  const diagnosticGraph = () => graph ??= rdf.dataset(facts)
  const objects = (subject, predicate) => [...diagnosticGraph().match(subject, predicate)].map(q => q.object)
  let collectionCells
  const collectionCell = subject => {
    if (!collectionCells) {
      collectionCells = rdf.termMap()
      for (const quad of [...collectionArcs, ...facts]) {
        if (quad.predicate.termType !== 'NamedNode' ||
            (quad.predicate.value !== RDF + 'first' && quad.predicate.value !== RDF + 'rest') || !diagnosticGraph().has(quad)) continue
        if (!collectionCells.has(quad.subject)) collectionCells.set(quad.subject, new Map())
        const cell = collectionCells.get(quad.subject)
        if (!cell.has(quad.predicate.value)) cell.set(quad.predicate.value, quad.object)
      }
    }
    return collectionCells.get(subject)
  }
  const iri = value => namespaceLabel(quads, value).replaceAll(rootURL, 'file://.//')
  const termKey = term => [term.termType, term.value, term.language ?? '',
    term.termType === 'Literal' && !term.language ? referenceDatatype(quads, term) ?? '' : '']
  const compareTerms = (left, right) => {
    const a = termKey(left), b = termKey(right)
    for (let i = 0; i < a.length; i++) {
      const order = compareLabels(a[i], b[i])
      if (order) return order
    }
    return 0
  }
  function collectionLabel(head, depth, cache) {
    const labels = [], visits = [], seen = rdf.termMap()
    while (head != null) {
      if (seen.has(head)) {
        labels.push('<http://recursion.too.deep>')
        break
      }
      seen.set(head, true)
      const cell = collectionCell(head)
      if (cell) inference.append(visits, head)
      if (cell?.has(RDF + 'first')) inference.append(labels, label(cell.get(RDF + 'first'), depth + 1, cache))
      head = cell?.get(RDF + 'rest')
    }
    return '( ' + labels.join(' ') + ' )'
  }
  function label(term, recursion, cache) {
    if (term.termType === 'NamedNode') return iri(term.value)
    if (term.termType === 'Literal') {
      const datatype = term.language ? null : referenceDatatype(quads, term)
      const value = datatype === 'http://www.w3.org/2001/XMLSchema#boolean'
        ? ' = ' + (term.value === 'true' ? 'True' : 'False') : ''
      return 'Literal("' + term.value + '"' + value + (term.language ? ', lang=' + term.language : '') +
        (datatype ? ', datatype=' + iri(datatype) : '') + ')'
    }
    const depth = recursion + 1
    if (depth >= 12) return '<http://recursion.too.deep>'
    if (cache.has(term)) return cache.get(term)
    const predicates = rdf.termMap([...diagnosticGraph().match(term)].map(q => [q.predicate, q.predicate]))
    if (!predicates.size) return '[ ]'
    if ([...predicates.keys()].some(p => p.value === RDF + 'first'))
      return collectionLabel(term, depth, cache)
    const values = new Map()
    for (const predicate of [...predicates.values()].sort((a, b) => compareLabels(iri(a.value), iri(b.value)))) {
      const labels = objects(term, predicate).sort(compareTerms).map(object =>
        // RDF equality is independent of constructor identity and whether the
        // self-equality was supplied by the crate or derived during inference.
        predicate.value === SAME_AS && object.equals(term)
          ? '<self>' : label(object, depth + 1, cache))
      if (labels.length) values.set(iri(predicate.value), labels.sort(compareLabels).join(', '))
    }
    const result = '[ ' + [...values].sort(([a], [b]) => compareLabels(a, b))
      .map(([predicate, objects]) => predicate + ' ' + objects).join(' ; ') + ' ]'
    cache.set(term, result)
    return result
  }
  return term => label(term, 0, rdf.termMap())
}
