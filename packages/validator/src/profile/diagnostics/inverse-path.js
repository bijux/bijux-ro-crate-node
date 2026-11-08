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
  let graph
  const diagnosticGraph = () => graph ??= rdf.dataset(facts)
  const objects = (subject, predicate) => [...diagnosticGraph().match(subject, predicate)].map(q => q.object)
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
      return '( ' + inference.list(term).map(item => label(item, depth + 1, cache)).join(' ') + ' )'
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
