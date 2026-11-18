import assert from 'node:assert/strict'
import core from '../../packages/core/package.json' with {type: 'json'}
import validator from '../../packages/validator/package.json' with {type: 'json'}

interface BrowserReceipt {
  distribution?: string
  workerPath?: unknown
  browserPath?: unknown
  validatorPath?: unknown
  corePath?: unknown
  reports?: Array<{selection?: {suite?: string}}>
}
type BindingPath = 'workerPath' | 'browserPath' | 'validatorPath' | 'corePath'

const installed = (name: string) => '/artifacts/consumers/validator/node_modules/' + name + '/dist/'
const paths = {
  source: {workerPath: '/packages/validator/dist/worker.js', browserPath: '/packages/validator/dist/browser.js',
    validatorPath: '/packages/validator/dist/index.js', corePath: '/packages/core/dist/index.js'},
  installed: {workerPath: installed(validator.name) + 'worker.js', browserPath: installed(validator.name) + 'browser.js',
    validatorPath: installed(validator.name) + 'index.js', corePath: installed(core.name) + 'index.js'},
}

/** A distribution label cannot substitute for the module paths actually used. */
export function assertBrowserBindings(document: BrowserReceipt, suite?: string) {
  const suites = [suite, ...(document.reports ?? []).map(row => row.selection?.suite)].filter(Boolean) as string[]
  const present = (Object.keys(paths.source) as BindingPath[]).filter(key => Object.hasOwn(document, key))
  if (!suites.length && !present.length) return
  const expected = paths[document.distribution as keyof typeof paths]
  assert.ok(expected, 'Browser bindings require a source or installed distribution')
  const required = new Set<BindingPath>()
  if (suites.includes('browser-parity')) required.add('workerPath')
  if (suites.some(suite => ['session-continuation', 'literal-grammar', 'jsonld-processing', 'inferred-collections', 'collection-diagnostics'].includes(suite)))
    for (const key of ['workerPath', 'browserPath', 'corePath'] as const) required.add(key)
  for (const key of new Set([...present, ...required]))
    assert.equal(document[key], expected[key], 'Browser ' + key + ' does not match ' + document.distribution + ' distribution')
}
