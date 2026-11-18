import assert from 'node:assert/strict'
import test from 'node:test'
import {createDocumentLoader} from '../src/index.ts'

test('trusted resource ownership survives caller and result mutation', async () => {
  const document = {'@context': {name: 'https://schema.org/name'}}
  const resources = new Map([['https://example.org/context', document]])
  const load = createDocumentLoader(resources)
  document['@context'].name = 'wrong'
  resources.clear()
  const loaded = await load('https://example.org/context')
  assert.equal((loaded.document as typeof document)['@context'].name, 'https://schema.org/name')
  ;(loaded.document as typeof document)['@context'].name = 'also wrong'
  assert.equal(((await load('https://example.org/context')).document as typeof document)['@context'].name, 'https://schema.org/name')
  await assert.rejects(load('http://127.0.0.1/private'), /unavailable offline/)
})
