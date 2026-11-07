import assert from 'node:assert/strict'
import test from 'node:test'
import {localLoader} from '../../src/profile/loader.js'

test('loader resolves both bundled RO-Crate context URLs offline', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => {
    throw new Error('Network access is forbidden in this test')
  })
  const load = localLoader()
  const canonicalURL = 'https://w3id.org/ro/crate/1.1/context'
  const aliasURL = 'https://www.researchobject.org/ro-crate/specification/1.1/context.jsonld'
  const canonical = await load(canonicalURL)
  const alias = await load(aliasURL)

  assert.equal(canonical.documentUrl, canonicalURL)
  assert.equal(alias.documentUrl, aliasURL)
  assert.equal(canonical.contextUrl, null)
  assert.equal(canonical.document['@context'].name, 'http://schema.org/name')
  assert.deepEqual(alias.document, canonical.document)
  assert.equal(fetch.mock.callCount(), 0)
})

test('loader resolves explicitly supplied local contexts', async () => {
  const url = 'https://example.invalid/local-context'
  const document = {'@context': {label: 'http://schema.org/name'}}
  const result = await localLoader(new Map([[url, document]]))(url)

  assert.deepEqual(result, {documentUrl: url, contextUrl: null, document})
})

test('loader rejects unknown remote contexts without fetching', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => {
    throw new Error('Network access is forbidden in this test')
  })
  await assert.rejects(localLoader()('https://unknown.invalid/context'), {
    message: 'JSON-LD context is unavailable offline: https://unknown.invalid/context'
  })
  assert.equal(fetch.mock.callCount(), 0)
})
