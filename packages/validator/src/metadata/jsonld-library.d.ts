declare module 'jsonld/lib/ContextResolver.js' {
  interface ContextCache {
    get(key: string): Map<string, unknown> | undefined
    set(key: string, value: Map<string, unknown>): unknown
  }
  export default class ContextResolver {
    constructor(options: {sharedCache: ContextCache})
  }
}

declare module 'jsonld' {
  export interface NamedNode {termType: 'NamedNode'; value: string}
  export interface BlankNode {termType: 'BlankNode'; value: string}
  export interface DefaultGraph {termType: 'DefaultGraph'; value: ''}
  export interface Literal {termType: 'Literal'; value: unknown; datatype: {termType: 'NamedNode'; value: unknown}; language?: string}
  export type RDFTerm = NamedNode | BlankNode | DefaultGraph | Literal
  export interface RDFQuad {
    subject: NamedNode | BlankNode
    predicate: NamedNode | BlankNode
    object: NamedNode | BlankNode | Literal
    graph: NamedNode | BlankNode | DefaultGraph
  }
  class IdentifierIssuer {
    constructor(prefix: string, existing?: Map<string, string>, counter?: number)
    getId(old?: string): string
    hasId(old: string): boolean
    getOldIds(): string[]
    clone(): IdentifierIssuer
  }
  const jsonld: {
    expand(input: unknown, options?: object): Promise<unknown[]>
    processContext(activeContext: unknown, localContext: unknown, options?: object): Promise<unknown>
    toRDF<T extends object>(input: unknown, options: T & {format: 'application/n-quads'}): Promise<string>
    toRDF<T extends object>(input: unknown, options?: T & {format?: undefined}): Promise<RDFQuad[]>
    toRDF(input: unknown, options: object): Promise<RDFQuad[] | string>
    util: {IdentifierIssuer: typeof IdentifierIssuer}
  }
  export default jsonld
}
