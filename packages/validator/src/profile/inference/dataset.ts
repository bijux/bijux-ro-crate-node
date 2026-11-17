import {collectionGraph} from './collections.js'

interface Term {termType: string; value: string; language?: string; datatype?: {value: string}; equals(other: Term): boolean}
interface Quad {subject: Term; predicate: Term; object: Term; graph: Term}
interface Dataset extends Iterable<Quad> {
  match(subject?: Term | null, predicate?: Term | null, object?: Term | null): Iterable<Quad>
  has(quad: Quad): boolean
  add(quad: Quad): unknown
  delete(quad: Quad): unknown
}
interface TermMap<V> {readonly size: number; has(term: Term): boolean; get(term: Term): V | undefined; set(term: Term, value: V): unknown; values(): IterableIterator<V>}
interface RDFEnvironment {dataset(): Dataset; namedNode(value: string): Term; quad(subject: Term, predicate: Term, object: Term): Quad; termMap<V>(): TermMap<V>}
interface InferenceOptions {maxInferredQuads?: number; maxPaths?: number; inputQuads?: Quad[]; literalValue?: (term: Term) => unknown}
interface Inference {
  graph: Iterable<Quad>
  node(value: Term | string): Term
  add(subject: Term, predicate: Term | string, object: Term): void
  has(subject: Term, predicate: Term | string, object: Term | string): boolean
  match(subject: Term | null, predicate?: Term | string | null, object?: Term | null): Generator<Quad>
  objects(subject: Term, predicate: Term | string): Term[]
  subjects(predicate: Term | string, object: Term | string): Term[]
  collection(head: Term | null | undefined): ReturnType<typeof collectionGraph>
  append<T>(paths: T[], value: T): void
  literalValue(term: Term): unknown
  collectionArcs(): Quad[]
  termMap<V>(): TermMap<V>
  removeBlankPredicates(): void
  close(rules: ((inference: Inference) => void)[]): void
}

export const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
export const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
export const OWL = 'http://www.w3.org/2002/07/owl#'

/** One budget belongs to the whole closure, including cooperating rule groups. */
export function inferenceDataset(graph: Dataset, rdf: RDFEnvironment, {maxInferredQuads = 100000, maxPaths = 100000, inputQuads = [...graph], literalValue = () => undefined}: InferenceOptions = {}): Inference {
  // Generalized literal-subject and blank-predicate facts cooperate privately;
  // the caller's RDF dataset stays suitable for SHACL.
  const generalizedFacts = rdf.dataset()
  const reasoningGraph = {[Symbol.iterator]: function* () {yield* graph; yield* generalizedFacts}}
  const node = (value: Term | string) => typeof value === 'string' ? rdf.namedNode(value) : value
  // Diagnostic graph.value lookups use assertion order, which RDF dataset
  // indexes need not preserve. OWL LIST rules remain independent of this order.
  const collectionAssertions = new Map<string, Quad>()
  const recordCollection = (quad: Quad) => {
    if (quad.predicate.termType !== 'NamedNode' ||
        (quad.predicate.value !== RDF + 'first' && quad.predicate.value !== RDF + 'rest')) return
    const key = JSON.stringify([quad.subject.termType, quad.subject.value, quad.subject.language ?? '',
      quad.subject.datatype?.value ?? '', quad.predicate.value, quad.object.termType, quad.object.value,
      quad.object.language ?? '', quad.object.datatype?.value ?? '', quad.graph.termType, quad.graph.value])
    if (!collectionAssertions.has(key)) collectionAssertions.set(key, quad)
  }
  inputQuads.forEach(recordCollection)
  for (const quad of graph) recordCollection(quad)
  let inferred = 0, changed = false
  function* match(s: Term | null, p?: Term | string | null, o?: Term | null): Generator<Quad> {
    p = p == null ? null : node(p)
    yield* graph.match(s, p, o)
    yield* generalizedFacts.match(s, p, o)
  }
  const add = (s: Term, p: Term | string, o: Term) => {
    p = node(p)
    if (p.termType !== 'NamedNode' && p.termType !== 'BlankNode') return
    const target = s.termType === 'Literal' || p.termType === 'BlankNode' ? generalizedFacts : graph
    const quad = rdf.quad(s, p, o)
    if (graph.has(quad) || generalizedFacts.has(quad)) return
    if (inferred >= maxInferredQuads) throw new Error('Profile inference exceeded its inferred quad budget')
    target.add(quad)
    recordCollection(quad)
    inferred++
    changed = true
  }
  const has = (s: Term, p: Term | string, o: Term | string) => {
    const quad = rdf.quad(s, node(p), node(o))
    return graph.has(quad) || generalizedFacts.has(quad)
  }
  const objects = (s: Term, p: Term | string) => [...match(s, p)].map(q => q.object)
  const subjects = (p: Term | string, o: Term | string) => [...match(null, p, node(o))].map(q => q.subject)
  const collection = (head: Term | null | undefined) => collectionGraph(head, {objects, rdf, maxPaths})
  const append = <T>(paths: T[], value: T) => {
    if (paths.length >= maxPaths) throw new Error('Profile inference exceeded its path budget')
    paths.push(value)
  }
  return {graph: reasoningGraph, node, add, has, objects, subjects, match, collection, append, literalValue,
    collectionArcs: () => [...collectionAssertions.values()],
    termMap: <V>() => rdf.termMap<V>(),
    removeBlankPredicates() {
      for (const dataset of [graph, generalizedFacts])
        for (const quad of [...dataset])
          if (quad.predicate.termType === 'BlankNode') dataset.delete(quad)
    },
    close(rules: ((inference: Inference) => void)[]) {
      do {
        changed = false
        for (const rule of rules) rule(this)
      } while (changed)
    }}
}
