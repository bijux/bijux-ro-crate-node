import {contextDocument} from '../jsonld.js'
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/** RDFLib mutates propagation across ordered root contexts, including resets. */
export async function rootContextPropagates(context, options, propagate = true, references = new Set(), sourceBase = options.baseURL ?? 'file:///crate/ro-crate-metadata.json') {
  if (context === null) return true
  if (Array.isArray(context)) {
    for (const entry of context) propagate = await rootContextPropagates(entry, options, propagate, references, sourceBase)
    return propagate
  }
  if (typeof context === 'string') {
    const url = new URL(context, sourceBase).href
    if (references.has(url)) throw new TypeError('Recursive JSON-LD context')
    references.add(url)
    try {
      const remote = await options.documentLoader(url)
      const document = contextDocument(remote.document)
      return await rootContextPropagates(document['@context'], options, propagate, references, remote.documentUrl ?? url)
    } finally { references.delete(url) }
  }
  if (!isObject(context)) return propagate
  if (Object.hasOwn(context, '@context')) return rootContextPropagates(context['@context'], options, propagate, references, sourceBase)
  if (typeof context['@import'] === 'string')
    propagate = await rootContextPropagates(context['@import'], options, propagate, references)
  return typeof context['@propagate'] === 'boolean' ? context['@propagate'] : propagate
}
