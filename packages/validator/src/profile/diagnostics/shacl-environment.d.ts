declare module 'rdf-validate-shacl/src/defaultEnv.js' {
  type Term = import('../inference/dataset.js').Term
  type Dataset = import('../inference/dataset.js').Dataset
  type TermMap<V> = import('../inference/dataset.js').TermMap<V>
  type Quad = Dataset extends Iterable<infer Q> ? Q : never
  const rdf: {
    dataset(quads?: Iterable<Quad>): Dataset
    namedNode(value: string): Term
    blankNode(value: string): Term
    literal(value: string, languageOrDatatype?: string | Term): Term
    quad(subject: Term, predicate: Term, object: Term, graph?: Term): Quad
    fromTerm(term: import('jsonld').RDFTerm & {value: string}): Term
    termMap<V>(entries?: Iterable<readonly [Term, V]>): TermMap<V>
  }
  export default rdf
}

declare module '@rdfjs/environment/Environment.js' {
  type Intersection<T> = (T extends unknown ? (value: T) => void : never) extends (value: infer I) => void ? I : never
  export type Environment<T> = Intersection<T>
}

declare module '@rdfjs/term-map/Factory.js' {
  export interface TermMapFactory {
    termMap<V>(entries?: Iterable<readonly [import('../inference/dataset.js').Term, V]>): import('../inference/dataset.js').TermMap<V>
  }
}

declare module 'clownface/Factory.js' {
  export default class ClownfaceFactory {
    clownface(options?: object): unknown
  }
}

declare module 'rdf-validate-shacl' {
  type Term = import('../inference/dataset.js').Term
  type Dataset = import('../inference/dataset.js').Dataset
  interface Result {message: Term[]; path: Term | null; focusNode: Term | null; sourceConstraintComponent: Term | null; sourceShape: Term | null; value: Term | null}
  export default class SHACLValidator {
    constructor(shapes: Dataset)
    validate(graph: Dataset): Promise<{results: Result[]}>
  }
}

declare module 'clownface' {
  export interface AnyPointer {readonly dataset: unknown}
  export interface GraphPointer extends AnyPointer {}
  export interface MultiPointer extends AnyPointer {}
}

declare module '@rdfjs/term-set' {
  export default class TermSet implements Iterable<import('@rdfjs/types').Term> {
    constructor(terms?: Iterable<import('@rdfjs/types').Term>)
    readonly size: number
    add(term: import('@rdfjs/types').Term): this
    has(term: import('@rdfjs/types').Term | null | undefined): boolean
    delete(term: import('@rdfjs/types').Term | null | undefined): boolean
    clear(): void
    values(): Set<import('@rdfjs/types').Term>
    keys(): Set<import('@rdfjs/types').Term>
    [Symbol.iterator](): Iterator<import('@rdfjs/types').Term>
  }
}
