import test from 'node:test'
import assert from 'node:assert/strict'
import {validateCrate} from '../../src/index.js'
import {cases, python, assertUpstreamResult} from '../../../../tests/reference/upstream-defects/checks.mjs'

for (const item of cases.filter(item => item.name.startsWith('profile-converter-failures/'))) {
  test(item.name + ' preserves required checks and agreeing converter controls', async () => {
    const original = python.get(item.name)
    assert.equal(original.status, 'valid', 'Keep the upstream failure explicit')
    assert.deepEqual(original.report.issues.ERROR, [])
    assertUpstreamResult(item, await validateCrate(new Map(Object.entries(item.files))))
  })
}
