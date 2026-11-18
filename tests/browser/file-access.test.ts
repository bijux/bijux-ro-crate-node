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
const setInputFilePaths = Function('return ({' + source.slice(start, end) + '}).setInputFilePaths')() as
  (this: object, progress: {race<T>(value: Promise<T>): Promise<T>}, element: {_objectId: string}, paths: string[]) => Promise<unknown>

function protocol() {
  const grant = Promise.withResolvers<void>()
  const requested = Promise.withResolvers<void>()
  const calls: {method: string; args: unknown}[] = []
  const page = {
    _browserContext: {},
    _pageProxySession: {sessionId: 'page', connection: {browserSession: {send(method: string, args: unknown) {
      calls.push({method, args})
      requested.resolve()
      return grant.promise
    }}}},
    _session: {send(method: string, args: unknown) {calls.push({method, args}); return Promise.resolve()}},
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

const directoryStart = source.indexOf('      async _setInputFiles(')
const directoryEnd = source.indexOf('      async focus(', directoryStart)
assert.ok(directoryStart >= 0 && directoryEnd > directoryStart, 'Review directory upload handling when Playwright changes its method layout')
const setInputFiles = Function('import_fs13', 'return ({' + source.slice(directoryStart, directoryEnd) + '})._setInputFiles')({
  default: {promises: {access: async () => {}}, constants: {F_OK: 0}},
}) as (this: object, progress: {race<T>(value: T): T}, items: {localDirectory?: string; localPaths?: string[]}) => Promise<unknown>

function directoryProtocol({holdRegistration = false, nativeError, waitError}: {holdRegistration?: boolean; nativeError?: unknown; waitError?: unknown} = {}) {
  const registration = Promise.withResolvers<void>(), requested = Promise.withResolvers<void>(), calls: string[] = []
  if (!holdRegistration) registration.resolve()
  const node = new EventTarget(), add = node.addEventListener.bind(node)
  node.addEventListener = (...args) => {calls.push('listener'); return add(...args)}
  const target = {asElement() {return this}}
  const element = {
    _evaluateHandleInUtility: async () => target,
    instrumentation: {onBeforeInputAction: async () => {}},
    async evaluate(fn: (node: EventTarget) => unknown) {await Promise.resolve(); return fn(node)},
    async evaluateHandle(fn: (node: EventTarget) => unknown) {
      requested.resolve()
      await registration.promise
      const box = fn(node)
      return {evaluate: (fn: (box: unknown) => unknown) => waitError ? Promise.reject(waitError) : fn(box), dispose: async () => {calls.push('dispose')} }
    },
    _page: {delegate: {async setInputFilePaths() {
      calls.push('native')
      if (nativeError) throw nativeError
      node.dispatchEvent(new Event('input'))
    }}},
  }
  return {registration, requested, calls, run: (items: {localDirectory?: string; localPaths?: string[]}) => setInputFiles.call(element, {race: value => value}, items)}
}

test('directory upload waits for listener registration before native input', {timeout: 1000}, async () => {
  const p = directoryProtocol({holdRegistration: true})
  const operation = p.run({localDirectory: '/crate'})
  await p.requested.promise
  try {assert.deepEqual(p.calls, [])} finally {p.registration.resolve()}
  assert.equal(await operation, 'done')
  assert.deepEqual(p.calls, ['listener', 'native', 'dispose'])
})

test('directory upload receives an immediate native input event', {timeout: 1000}, async () => {
  const p = directoryProtocol()
  assert.equal(await p.run({localDirectory: '/crate'}), 'done')
  assert.deepEqual(p.calls, ['listener', 'native', 'dispose'])
})

for (const [name, options] of [
  ['native failure', {nativeError: new Error('native failure')}],
  ['event wait failure', {waitError: new Error('event wait failure')}],
] as [string, {nativeError?: unknown; waitError?: unknown}][]) test('directory upload releases its event handle after ' + name, async () => {
  const p = directoryProtocol(options)
  await assert.rejects(p.run({localDirectory: '/crate'}), new RegExp(name))
  assert.deepEqual(p.calls, ['listener', 'native', 'dispose'])
})

test('ordinary file paths do not create a directory event waiter', async () => {
  const p = directoryProtocol({holdRegistration: true})
  assert.equal(await p.run({localPaths: ['/crate/file']}), 'done')
  assert.deepEqual(p.calls, ['native'])
})
