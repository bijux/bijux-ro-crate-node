export function createDocumentLoader(contexts = new Map()) {
  const resources = new Map([...contexts].map(([url, document]) => [url, structuredClone(document)]))
  return async url => {
    if (!resources.has(url)) throw new Error('JSON-LD context is unavailable offline: ' + url)
    return {documentUrl: url, contextUrl: null, document: structuredClone(resources.get(url))}
  }
}
