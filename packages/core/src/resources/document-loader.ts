import type {LoadedDocument} from '../index.js'

export function createDocumentLoader(contexts: ReadonlyMap<string, unknown> = new Map()): (url: string) => Promise<LoadedDocument> {
  const resources = new Map([...contexts].map(([url, document]) => [url, structuredClone(document)]))
  return async (url: string) => {
    if (!resources.has(url)) throw new Error('JSON-LD context is unavailable offline: ' + url)
    return {documentUrl: url, contextUrl: null, document: structuredClone(resources.get(url))}
  }
}
