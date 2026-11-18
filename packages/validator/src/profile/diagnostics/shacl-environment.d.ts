declare module 'rdf-validate-shacl/src/defaultEnv.js' {
  type Term = import('../inference/dataset.js').Term
  type Dataset = import('../inference/dataset.js').Dataset
  type TermMap<V> = import('../inference/dataset.js').TermMap<V>
  type Quad = Dataset extends Iterable<infer Q> ? Q : never
  const rdf: {
    dataset(quads: Iterable<Quad>): Dataset
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
