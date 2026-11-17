declare module 'jsonld/lib/ContextResolver.js' {
  export default class ContextResolver {
    constructor(options: {sharedCache: Map<string, Map<string, unknown>>})
  }
}

declare module 'jsonld' {
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
    toRDF(input: unknown, options?: object): Promise<unknown>
    util: {IdentifierIssuer: typeof IdentifierIssuer}
  }
  export default jsonld
}
