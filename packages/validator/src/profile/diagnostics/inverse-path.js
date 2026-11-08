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
export function inversePathFormatter(inference, quads, inputQuads, rootURL) {
  // Flattened class membership serves the JavaScript SHACL engine only. Python
  // reports inspect the graph after procedural rules and before that flattening.
  const facts = [...inference.graph]
  let graph
  const diagnosticGraph = () => graph ??= rdf.dataset(facts)
  const objects = (subject, predicate) => [...diagnosticGraph().match(subject, predicate)].map(q => q.object)
  const cache = rdf.termMap()
  const inputEquality = rdf.termMap(inputQuads.filter(q => q.predicate.value === SAME_AS).map(q => [q.subject, true]))
  const iri = value => namespaceLabel(quads, value).replaceAll(rootURL, 'file://.//')
  function label(term, recursion = 0) {
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
      return '( ' + inference.list(term).map(item => label(item, depth + 1)).join(' ') + ' )'
    const values = new Map()
    for (const predicate of predicates.values()) {
      const labels = objects(term, predicate).map(object =>
        // Ordinary inferred self-equality uses pySHACL's <self> label. Explicit
        // equality retains recursive text. Cyclic constructor-identity differences
        // remain an explicit compatibility gap rather than a message waiver.
        predicate.value === SAME_AS && object.equals(term) && !inputEquality.has(term)
          ? '<self>' : label(object, depth + 1))
      if (labels.length) values.set(iri(predicate.value), labels.sort(compareLabels).join(', '))
    }
    const result = '[ ' + [...values].sort(([a], [b]) => compareLabels(a, b))
      .map(([predicate, objects]) => predicate + ' ' + objects).join(' ; ') + ' ]'
    cache.set(term, result)
    return result
  }
  return label
}
