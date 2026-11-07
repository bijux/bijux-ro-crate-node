import jsonld from 'jsonld'
import ContextResolver from 'jsonld/lib/ContextResolver.js'

const resolvers = new WeakMap()

/** Reuse contexts within one immutable loader snapshot, never across loaders. */
export function jsonldOptions(options) {
  const owner = options.documentLoader ?? options
  let contextResolver = resolvers.get(owner)
  if (!contextResolver) {
    contextResolver = new ContextResolver({sharedCache: new Map()})
    resolvers.set(owner, contextResolver)
  }
  return {base: options.baseURL ?? 'file:///crate/ro-crate-metadata.json', contextResolver,
    ...(options.documentLoader ? {documentLoader: options.documentLoader} : {})}
}

export {jsonld}
