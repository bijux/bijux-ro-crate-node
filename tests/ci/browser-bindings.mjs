import assert from 'node:assert/strict'
import core from '../../packages/core/package.json' with {type: 'json'}
import validator from '../../packages/validator/package.json' with {type: 'json'}

const installed = name => '/artifacts/consumers/validator/node_modules/' + name + '/dist/'
const paths = {
  source: {workerPath: '/packages/validator/dist/worker.js', browserPath: '/packages/validator/dist/browser.js',
    validatorPath: '/packages/validator/dist/index.js', corePath: '/packages/core/dist/index.js'},
  installed: {workerPath: installed(validator.name) + 'worker.js', browserPath: installed(validator.name) + 'browser.js',
    validatorPath: installed(validator.name) + 'index.js', corePath: installed(core.name) + 'index.js'},
}

/** A distribution label cannot substitute for the module paths actually used. */
export function assertBrowserBindings(document, suite) {
  const suites = [suite, ...(document.reports ?? []).map(row => row.selection?.suite)].filter(Boolean)
  const present = Object.keys(paths.source).filter(key => Object.hasOwn(document, key))
  if (!suites.length && !present.length) return
  const expected = paths[document.distribution]
  assert.ok(expected, 'Browser bindings require a source or installed distribution')
  const required = new Set()
  if (suites.includes('browser-parity')) required.add('workerPath')
  if (suites.some(suite => ['session-continuation', 'literal-grammar', 'jsonld-processing', 'inferred-collections', 'collection-diagnostics'].includes(suite)))
    for (const key of ['workerPath', 'browserPath', 'corePath']) required.add(key)
  for (const key of new Set([...present, ...required]))
    assert.equal(document[key], expected[key], 'Browser ' + key + ' does not match ' + document.distribution + ' distribution')
}
