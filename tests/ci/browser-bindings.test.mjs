import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdir, mkdtemp, writeFile, rm} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {assertBrowserBindings} from './browser-bindings.mjs'

const source = {distribution: 'source', workerPath: '/packages/validator/dist/worker.js',
  browserPath: '/packages/validator/dist/browser.js', corePath: '/packages/core/dist/index.js'}
const installed = {distribution: 'installed',
  workerPath: '/artifacts/consumers/validator/node_modules/@bijux/ro-crate-validator/dist/worker.js',
  browserPath: '/artifacts/consumers/validator/node_modules/@bijux/ro-crate-validator/dist/browser.js',
  corePath: '/artifacts/consumers/validator/node_modules/@bijux/ro-crate-core/dist/index.js'}

test('source and installed workers and Sessions retain their owned bindings', () => {
  for (const document of [source, installed]) {
    assertBrowserBindings(document, 'browser-parity')
    assertBrowserBindings(document, 'session-continuation')
    assertBrowserBindings(document, 'literal-grammar')
    assertBrowserBindings(document, 'inferred-collections')
    assertBrowserBindings(document, 'collection-diagnostics')
  }
})

for (const suite of ['literal-grammar', 'inferred-collections', 'collection-diagnostics'])
test(suite + ' coverage requires all owned Session modules before counting cases', () => {
  const reports = [{selection: {suite}}]
  assert.throws(() => assertBrowserBindings({distribution: 'installed', reports}), /Browser/)
  for (const key of ['workerPath', 'browserPath', 'corePath']) {
    assert.throws(() => assertBrowserBindings({...installed, [key]: source[key], reports}), /Browser/)
    const missing = {...installed, reports}
    delete missing[key]
    assert.throws(() => assertBrowserBindings(missing), /Browser/)
  }
})

test('a source-bound installed lane fails despite its distribution label', () => {
  for (const key of ['workerPath', 'browserPath', 'corePath']) {
    assert.throws(() => assertBrowserBindings({...installed, [key]: source[key]}, 'session-continuation'),
      new RegExp('Browser ' + key))
    const missing = {...installed}
    delete missing[key]
    assert.throws(() => assertBrowserBindings(missing, 'session-continuation'))
  }
  assert.throws(() => assertBrowserBindings({...source, workerPath: installed.workerPath}, 'browser-parity'))
})

test('browser coverage rejects source-bound installed artifacts before counting shards', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const work = new URL('../../artifacts/work/', import.meta.url)
  await mkdir(work, {recursive: true})
  const directory = await mkdtemp(fileURLToPath(new URL('browser-bindings-', work)))
  try {
    await writeFile(directory + '/receipt.json', JSON.stringify({distribution: 'installed',
      workerPath: source.workerPath, reports: [{selection: {suite: 'browser-parity'}}]}))
    const result = spawnSync(process.execPath, ['tests/ci/verify-coverage.mjs', 'browser', directory, '3'],
      {cwd: root, encoding: 'utf8', timeout: 10000})
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Browser workerPath does not match installed distribution/)
  } finally {await rm(directory, {recursive: true, force: true})}
})


test('upstream defect guards reject source modules labeled as installed before browser launch', () => {
  const result = spawnSync(process.execPath, ['tests/browser/upstream-defects.mjs'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', timeout: 10000,
    env: {...process.env, BIJUX_BROWSER_SESSION_PATH: source.browserPath,
      BIJUX_BROWSER_WORKER_PATH: source.workerPath, BIJUX_BROWSER_CORE_PATH: source.corePath},
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Browser (?:browserPath|workerPath|corePath) does not match installed distribution/)
})
