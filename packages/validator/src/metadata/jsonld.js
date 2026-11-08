import jsonld from 'jsonld'
import {invalidURIAuthority} from './rdf/uri-authority.js'
import {parseJSONWithOrder} from './json/ordered-members.js'
import ContextResolver from 'jsonld/lib/ContextResolver.js'

const resolvers = new WeakMap()
const rdfResolvers = new WeakMap()

function processingOptions(options, resolverCache) {
  const owner = options.rdfPhysicalRoot ?? options.documentLoader ?? options
  let contextResolver = resolverCache.get(owner)
  if (!contextResolver) {
    contextResolver = new ContextResolver({sharedCache: new Map()})
    resolverCache.set(owner, contextResolver)
  }
  return {base: options.baseURL ?? 'file:///crate/ro-crate-metadata.json', contextResolver,
    ...(options.rdfPhysicalRoot ? {rdfPhysicalRoot: options.rdfPhysicalRoot} : {}),
    ...(options.documentLoader ? {documentLoader: options.documentLoader} : {})}
}

/** Reuse standard contexts within one immutable loader snapshot. */
export function jsonldOptions(options) {
  return {...processingOptions(options, resolvers), pyldContainerMappings: true, pyldContextKeywords: true}
}

/** RDFLib's term mappings must never enter standard metadata/model caches. */
export function rdfOptions(options) {
  return {...processingOptions(options, rdfResolvers),
    rdfLibTypeScopes: true, rdfLibJSONContainers: true, rdfLibRelativeIRIs: true,
    rdfLibImportKeywords: true, rdfLibInvalidAuthority: invalidURIAuthority}
}

/** Document loaders may supply parsed JSON or its serialized response body. */
export function contextDocument(value) {
  return typeof value === 'string' ? parseJSONWithOrder(value) : value
}

export {jsonld}
