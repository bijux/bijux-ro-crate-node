import assert from 'node:assert/strict'
import {createServer} from 'node:net'
import {once} from 'node:events'
import test from 'node:test'
import {dockerEnvironment, referenceEnvironment, localDockerHost, startOwnedServer} from './isolation.js'

test('disposable service environment overrides inherited destinations', () => {
  const inherited = {PATH:'/bin', BIJUX_LOCAL_DATABASE_PORT:'6543', BIJUX_LOCAL_IDENTITY_PORT:'1234', BIJUX_LOCAL_WEB_PORT:'9876', BIJUX_LOCAL_RECEIVER_PORT:'9090', BSS_MODE:'connected', ASTRO_NODE_AUTOSTART:'bad'}
  const env = referenceEnvironment(inherited)
  assert.equal(env.BIJUX_LOCAL_DATABASE_PORT, '15433')
  assert.equal(env.BIJUX_LOCAL_IDENTITY_PORT, '18080')
  assert.equal(env.BIJUX_LOCAL_WEB_PORT, '14321')
  assert.equal(env.BIJUX_LOCAL_RECEIVER_PORT, undefined)
  assert.equal(env.BSS_MODE, 'standalone')
  assert.equal(env.ASTRO_NODE_AUTOSTART, 'disabled')
  assert.equal(env.PATH, '/bin')
})

test('Docker environment drops context and Compose overrides', () => {
  const env = dockerEnvironment({PATH:'/bin', HOME:'/home/test', DOCKER_HOST:'tcp://example:2375', DOCKER_CONTEXT:'remote', COMPOSE_FILE:'other.yaml', COMPOSE_PROFILES:'unsafe', COMPOSE_ENV_FILES:'secret.env'})
  assert.deepEqual(env, {PATH:'/bin', HOME:'/home/test'})
})

test('Docker daemon must use the effective local Unix socket', () => {
  const inspect = (context?:string) => context === 'remote' ? 'tcp://remote:2375' : 'unix:///tmp/docker.sock'
  assert.equal(localDockerHost({}, inspect), 'unix:///tmp/docker.sock')
  assert.equal(localDockerHost({DOCKER_HOST:'unix:///tmp/rancher.sock'}, inspect), 'unix:///tmp/rancher.sock')
  assert.throws(() => localDockerHost({DOCKER_HOST:'tcp://remote:2375'}, inspect), /local Unix socket/)
  assert.throws(() => localDockerHost({DOCKER_CONTEXT:'remote', DOCKER_HOST:'unix:///tmp/local.sock'}, inspect), /local Unix socket/)
})

test('readiness never accepts an unrelated service on the occupied port', async () => {
  let hits = 0
  const stranger = createServer(socket => {hits++; socket.end('HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n')})
  stranger.listen(0, '127.0.0.1')
  await once(stranger, 'listening')
  const address = stranger.address()
  assert.ok(address && typeof address !== 'string')
  try {
    await assert.rejects(startOwnedServer(referenceEnvironment(process.env), address.port), /server.*(failed|exited|listen)/i)
    assert.equal(hits, 0)
    assert.equal(stranger.listening, true)
  } finally {await new Promise<void>((resolve, reject) => stranger.close(error => error ? reject(error) : resolve()))}
})
