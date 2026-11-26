import assert from 'node:assert/strict'
import {test} from 'node:test'
import {checkConnectivity, healthEndpoint} from '../../src/server/bss/connectivity.js'
const routeModule = '../../src/pages/api/bss/health.js'
const {GET} = await import(routeModule) as {GET: () => Promise<Response>}

test('BSS connectivity is disabled by default and preserves the configured API prefix', async () => {
  assert.equal(await checkConnectivity({}), 'disabled')
  assert.equal(healthEndpoint({BSS_MODE: 'local', BSS_API_BASE_URL: 'http://127.0.0.1:8000/api/v0/'})?.href, 'http://127.0.0.1:8000/api/v0/health')
  assert.equal(healthEndpoint({BSS_MODE: 'local', BSS_API_BASE_URL: 'http://bia-api:8000/api/v0', BSS_LOCAL_SERVICE_HOST: 'bia-api'})?.hostname, 'bia-api')
})

test('BSS connectivity rejects unsafe or malformed configuration', () => {
  for (const env of [
    {BSS_MODE: 'unknown'},
    {BSS_MODE: 'local', BSS_API_BASE_URL: 'http://example.com/api/v0'},
    {BSS_MODE: 'connected', BSS_API_BASE_URL: 'http://example.com/api/v0'},
    {BSS_MODE: 'connected', BSS_API_BASE_URL: 'https://user:secret@example.com/api/v0'},
    {BSS_MODE: 'connected', BSS_API_BASE_URL: 'https://example.com/api/v0?token=x'},
  ]) assert.throws(() => healthEndpoint(env))
})

test('invalid BSS configuration is distinct from an unreachable service and never sends a request', async () => {
  let requested = false
  const result = await checkConnectivity({BSS_MODE: 'local', BSS_API_BASE_URL: 'http://user:secret@example.com/api/v0'}, async () => {
    requested = true
    return new Response(null, {status: 200})
  })
  assert.equal(result, 'misconfigured')
  assert.equal(requested, false)
})

test('BSS connectivity reports upstream failures without following redirects', async () => {
  const env = {BSS_MODE: 'local', BSS_API_BASE_URL: 'http://127.0.0.1:8000/api/v0'}
  const request: typeof fetch = async (_input, init) => {
    assert.equal(init?.redirect, 'manual')
    assert.ok(init?.signal)
    return new Response(null, {status: 302, headers: {location: 'https://example.com'}})
  }
  assert.equal(await checkConnectivity(env, request), 'unavailable')
  assert.equal(await checkConnectivity(env, async () => new Response(null, {status: 200})), 'reachable')
  assert.equal(await checkConnectivity(env, async () => {throw new Error('network')}), 'unavailable')
})

test('health route returns a private, non-cacheable error for invalid configuration', async () => {
  const oldMode = process.env.BSS_MODE
  const oldUrl = process.env.BSS_API_BASE_URL
  try {
    process.env.BSS_MODE = 'local'
    process.env.BSS_API_BASE_URL = 'http://example.com/api/v0'
    const response = await GET()
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), {status: 'misconfigured'})
  } finally {
    if (oldMode === undefined) delete process.env.BSS_MODE
    else process.env.BSS_MODE = oldMode
    if (oldUrl === undefined) delete process.env.BSS_API_BASE_URL
    else process.env.BSS_API_BASE_URL = oldUrl
  }
})
