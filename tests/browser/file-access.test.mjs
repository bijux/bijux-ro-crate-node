import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import test from 'node:test'

const require = createRequire(import.meta.url)
const root = new URL('./', pathToFileURL(require.resolve('playwright-core/package.json')))
const source = await readFile(new URL('lib/coreBundle.js', root), 'utf8')
// Exercise the installed dependency's actual WebKit method with controlled
// protocol replies, so the test does not depend on native process scheduling.
const start = source.lastIndexOf('      async setInputFilePaths(')
const end = source.indexOf('      async adoptElementHandle(', start)
assert.ok(start >= 0 && end > start, 'Review the file access patch when Playwright changes its method layout')
const setInputFilePaths = Function('return ({' + source.slice(start, end) + '}).setInputFilePaths')()

function protocol() {
  const grant = Promise.withResolvers()
  const requested = Promise.withResolvers()
  const calls = []
  const page = {
    _browserContext: {},
    _pageProxySession: {sessionId: 'page', connection: {browserSession: {send(method, args) {
      calls.push({method, args})
      requested.resolve()
      return grant.promise
    }}}},
    _session: {send(method, args) {calls.push({method, args}); return Promise.resolve()}},
  }
  return {grant, requested, calls, run: () => setInputFilePaths.call(page,
    {race: promise => promise}, {_objectId: 'input'}, ['/crate'])}
}

test('WebKit waits for native file permission before starting upload', async () => {
  const p = protocol()
  const result = p.run()
  await p.requested.promise
  try {
    assert.deepEqual(p.calls, [{method: 'Playwright.grantFileReadAccess', args: {pageProxyId: 'page', paths: ['/crate']}}])
  } finally {p.grant.resolve()}
  await result
  assert.deepEqual(p.calls[1], {method: 'DOM.setInputFiles', args: {objectId: 'input', paths: ['/crate']}})
})

test('WebKit refuses native upload when file permission fails', async () => {
  const p = protocol()
  const result = p.run()
  const rejected = assert.rejects(result, /permission denied/)
  await p.requested.promise
  p.grant.reject(new Error('permission denied'))
  await rejected
  assert.equal(p.calls.length, 1)
})
