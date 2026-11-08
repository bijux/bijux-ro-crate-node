import jsonld from 'jsonld'
import ContextResolver from 'jsonld/lib/ContextResolver.js'

const resolvers = new WeakMap()
const rdfResolvers = new WeakMap()

function processingOptions(options, resolverCache) {
  const owner = options.documentLoader ?? options
  let contextResolver = resolverCache.get(owner)
  if (!contextResolver) {
    contextResolver = new ContextResolver({sharedCache: new Map()})
    resolverCache.set(owner, contextResolver)
  }
  return {base: options.baseURL ?? 'file:///crate/ro-crate-metadata.json', contextResolver,
    ...(options.documentLoader ? {documentLoader: options.documentLoader} : {})}
}

/** Reuse standard contexts within one immutable loader snapshot. */
export function jsonldOptions(options) {
  return {...processingOptions(options, resolvers), pyldContainerMappings: true}
}

/** RDFLib's term mappings must never enter standard metadata/model caches. */
export function rdfOptions(options) {
  return {...processingOptions(options, rdfResolvers), rdfLibTypeScopes: true, rdfLibJSONContainers: true}
}

/** Document loaders may supply parsed JSON or its serialized response body. */
export function contextDocument(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
}

export {jsonld}
