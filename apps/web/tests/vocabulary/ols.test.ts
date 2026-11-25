import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createOlsProvider} from '../../src/server/vocabulary/ols.js'

const response = (data: unknown) => new Response(JSON.stringify(data), {status:200, headers:{'content-type':'application/json'}})

test('exact lookup normalizes source evidence and keeps searches unverified', async () => {
  const calls: string[] = []
  const provider = createOlsProvider({fetch:async input => {
    calls.push(String(input))
    return response(String(input).includes('/search?') ? {response:{docs:[{obo_id:'NCBITaxon:9606',label:'Homo sapiens'}]}} : {obo_id:'NCBITaxon:9606',label:'Homo sapiens',synonyms:['human'],is_obsolete:false})
  }})
  const suggestions = await provider.search('taxonomy', 'human')
  assert.equal(suggestions.status, 'ok')
  const exact = await provider.exact('taxonomy', 'NCBITaxon:9606')
  assert.equal(exact.status, 'found')
  if (exact.status === 'found') assert.equal(exact.term.label, 'Homo sapiens')
  await provider.exact('taxonomy', 'NCBITaxon:9606')
  assert.equal(calls.length, 2)
  assert.ok(calls.every(url => url.startsWith('https://www.ebi.ac.uk/ols4/api/')))
})

test('unknown and unavailable are distinct and identifiers cannot select a URL', async () => {
  const empty = createOlsProvider({fetch:async input => String(input).includes('/terms/') ? new Response(null,{status:404}) : response({ontologyId:'FBbi'})})
  assert.equal((await empty.exact('imaging', 'FBbi:99999999')).status, 'not-found')
  assert.equal((await empty.exact('imaging', 'https://example.org/')).status, 'unavailable')
  const failed = createOlsProvider({fetch:async () => {throw Error('offline')}})
  assert.equal((await failed.exact('taxonomy', 'NCBITaxon:9606')).status, 'unavailable')
})

test('timeouts and oversized or malformed responses are unavailable', async () => {
  const timeout = createOlsProvider({timeoutMs:10,fetch:async (_input, init) => new Promise<Response>((_resolve,reject) => init?.signal?.addEventListener('abort',() => reject(Error('aborted'))))})
  assert.equal((await timeout.exact('taxonomy','NCBITaxon:9606')).status,'unavailable')
  const oversized = createOlsProvider({fetch:async () => new Response('x'.repeat(270000))})
  assert.equal((await oversized.exact('taxonomy','NCBITaxon:9606')).status,'unavailable')
  const malformed = createOlsProvider({fetch:async () => response({unexpected:[]})})
  assert.equal((await malformed.exact('taxonomy','NCBITaxon:9606')).status,'unavailable')
})

test('a missing exact term is not found and obsolete evidence is retained', async () => {
  const empty = createOlsProvider({fetch:async input => String(input).includes('/terms/') ? new Response(null,{status:404}) : response({ontologyId:'FBbi'})})
  assert.equal((await empty.exact('imaging','FBbi:99999999')).status,'not-found')
  const missingOntology = createOlsProvider({fetch:async () => new Response(null,{status:404})})
  assert.equal((await missingOntology.exact('imaging','FBbi:99999999')).status,'unavailable')
  const obsolete = createOlsProvider({fetch:async () => response({obo_id:'FBbi:00000001',label:'old method',synonyms:[],is_obsolete:true})})
  const result = await obsolete.exact('imaging','FBbi:00000001')
  assert.equal(result.status,'found')
  if (result.status === 'found') assert.equal(result.term.obsolete,true)
})

test('evidence does not invent synonym information omitted by the source', async () => {
  const provider = createOlsProvider({fetch:async () => response({obo_id:'NCBITaxon:9606',label:'Homo sapiens',is_obsolete:false})})
  const result = await provider.exact('taxonomy','NCBITaxon:9606')
  if (result.status !== 'found') throw Error('term unavailable')
  assert.equal(Object.hasOwn(result.term,'synonyms'),false)
})
