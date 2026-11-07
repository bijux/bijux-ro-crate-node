import {createDocumentLoader} from '@bijux/ro-crate-core'
import context from './context.json' with {type: 'json'}

const urls = [
  'https://w3id.org/ro/crate/1.1/context',
  'https://w3id.org/ro/crate/1.1/context.jsonld',
  'https://www.researchobject.org/ro-crate/specification/1.1/context.jsonld',
]

export function localLoader(contexts = new Map()) {
  const documents = new Map(contexts)
  for (const url of urls) documents.set(url, context)
  return createDocumentLoader(documents)
}
