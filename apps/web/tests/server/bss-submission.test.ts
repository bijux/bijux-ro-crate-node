import assert from 'node:assert/strict'
import {once} from 'node:events'
import {createServer} from 'node:http'
import {test} from 'node:test'
import {readSubmission} from '../../src/server/bss/submission.js'

const id = '12345678-1234-4234-8234-123456789abc'
const token = 'fixture-token'

test('reads one authorized submission through the configured local API prefix', async t => {
  const requests: Array<{url:string | undefined; authorization:string | undefined}> = []
  const server = createServer((request, response) => {
    requests.push({url:request.url, authorization:request.headers.authorization})
    response.writeHead(200, {'content-type':'application/json'})
    response.end(JSON.stringify({id, status:'drafted', title:'Synthetic study', accession_id:null, upload_path:'/private/not-projected'}))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const result = await readSubmission({BSS_MODE:'local', BSS_API_BASE_URL:`http://127.0.0.1:${address.port}/api/v0/`}, id, token)
  assert.deepEqual(requests, [{url:`/api/v0/submissions/${id}`, authorization:`Bearer ${token}`}])
  assert.deepEqual(result, {kind:'ok', submission:{id, status:'drafted', title:'Synthetic study', accessionId:null}})
})

test('rejects invalid inputs and configuration before sending credentials', async () => {
  let requests = 0
  const request: typeof fetch = async () => {requests++; return new Response()}
  const env = {BSS_MODE:'local', BSS_API_BASE_URL:'http://127.0.0.1:8000/api/v0'}
  assert.deepEqual(await readSubmission(env, '../other', token, request), {kind:'invalid-request'})
  assert.deepEqual(await readSubmission(env, id, 'invalid\ncredential', request), {kind:'invalid-request'})
  assert.deepEqual(await readSubmission({BSS_MODE:'local', BSS_API_BASE_URL:'http://remote.example/api'}, id, token, request), {kind:'misconfigured'})
  assert.deepEqual(await readSubmission({}, id, token, request), {kind:'disabled'})
  assert.equal(requests, 0)
})

test('does not follow redirects or expose upstream errors', async () => {
  const env = {BSS_MODE:'local', BSS_API_BASE_URL:'http://127.0.0.1:8000/api/v0'}
  for (const [status, kind] of [[401,'unauthorized'],[403,'forbidden'],[404,'not-found'],[302,'unavailable'],[500,'unavailable']] as const) {
    const request: typeof fetch = async (_url, options) => {
      assert.equal(options?.redirect, 'manual')
      assert.equal(options?.cache, 'no-store')
      assert.ok(options?.signal)
      return new Response('private upstream detail', {status, headers:{location:'http://127.0.0.1:9999/other'}})
    }
    assert.deepEqual(await readSubmission(env, id, token, request), {kind})
  }
})

test('rejects malformed, mismatched and oversized responses', async () => {
  const env = {BSS_MODE:'local', BSS_API_BASE_URL:'http://127.0.0.1:8000/api/v0'}
  for (const body of ['not json', JSON.stringify({id:'different',status:'drafted'}), JSON.stringify({id,status:5}), JSON.stringify({id,status:'drafted',extra:'x'.repeat(1_048_577)}), new Uint8Array([0xff])]) {
    const request: typeof fetch = async () => new Response(body, {headers:{'content-type':'application/json'}})
    assert.deepEqual(await readSubmission(env, id, token, request), {kind:'invalid-response'})
  }
  const wrongType:typeof fetch = async () => new Response(JSON.stringify({id,status:'drafted'}), {headers:{'content-type':'text/html'}})
  assert.deepEqual(await readSubmission(env, id, token, wrongType), {kind:'invalid-response'})
})

test('retains unknown statuses and treats omitted optional fields as absent', async () => {
  const env = {BSS_MODE:'local', BSS_API_BASE_URL:'http://127.0.0.1:8000/api/v0'}
  const request:typeof fetch = async () => new Response(JSON.stringify({id,status:'future-status'}), {headers:{'content-type':'application/json'}})
  assert.deepEqual(await readSubmission(env, id, token, request), {kind:'ok', submission:{id,status:'future-status',title:null,accessionId:null}})
})

test('does not forward credentials across a real local redirect', async t => {
  let redirected = false
  const destination = createServer((_request, response) => {redirected = true; response.end()})
  destination.listen(0, '127.0.0.1'); await once(destination, 'listening')
  t.after(() => new Promise<void>((resolve, reject) => destination.close(error => error ? reject(error) : resolve())))
  const address = destination.address(); assert.ok(address && typeof address !== 'string')
  const source = createServer((_request, response) => {response.writeHead(302, {location:`http://127.0.0.1:${address.port}/other`}); response.end()})
  source.listen(0, '127.0.0.1'); await once(source, 'listening')
  t.after(() => new Promise<void>((resolve, reject) => source.close(error => error ? reject(error) : resolve())))
  const sourceAddress = source.address(); assert.ok(sourceAddress && typeof sourceAddress !== 'string')
  const result = await readSubmission({BSS_MODE:'local', BSS_API_BASE_URL:`http://127.0.0.1:${sourceAddress.port}/api`}, id, token)
  assert.deepEqual(result, {kind:'unavailable'})
  assert.equal(redirected, false)
})

test('bounds a stalled local response and does not expose transport errors', async t => {
  const server = createServer((_request, response) => {response.writeHead(200, {'content-type':'application/json'}); response.write('{')})
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => {server.closeAllConnections(); return new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))})
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const result = await readSubmission({BSS_MODE:'local', BSS_API_BASE_URL:`http://127.0.0.1:${address.port}/api`}, id, token)
  assert.deepEqual(result, {kind:'unavailable'})
  const request:typeof fetch = async () => {throw Error(`private ${token}`)}
  assert.deepEqual(await readSubmission({BSS_MODE:'local', BSS_API_BASE_URL:'http://127.0.0.1:8000/api'}, id, token, request), {kind:'unavailable'})
})
