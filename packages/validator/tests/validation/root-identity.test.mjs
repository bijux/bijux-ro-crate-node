import assert from 'node:assert/strict'
import test from 'node:test'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import {createCrateIdentity} from '../../src/validation/crate-identity.js'

const root = new URL('../../../../', import.meta.url)
const cases = JSON.parse(await readFile(new URL('tests/parity/inputs/rdf-root-identity.json', root))).cases
cases.push(...JSON.parse(await readFile(new URL('tests/parity/inputs/rdf-physical-base-controls.json', root))).cases)
const expected = new Map(JSON.parse(await readFile(new URL('tests/parity/expected/crates.json', root))).cases.map(item => [item.name, item]))
for (const item of cases) {
  test(item.name + ' preserves absolute IRI identity and deterministic reports', async () => {
    const wanted = expected.get(item.name)
    assertInputBytes(item, wanted)
    const options = {contexts: new Map(Object.entries(item.contexts ?? {}))}
    const actual = await validateCrate(new Map(Object.entries(item.files)), options)
    compareResult(actual, wanted, item.name)
    assert.deepEqual(await validateCrate(new Map(Object.entries(item.files)), options), actual)
    const supplied = new Set(JSON.stringify(item.files).match(/bijux-ro-crate-[0-9a-f]{32}/g) ?? [])
    for (const token of JSON.stringify(actual).match(/bijux-ro-crate-[0-9a-f]{32}/g) ?? [])
      assert.ok(supplied.has(token), 'A private validation identity escaped its rendering boundary')
    assert.deepEqual(Object.keys(actual).sort(), wanted.status === 'incomplete'
      ? ['reason', 'report', 'stage', 'status'] : ['report', 'status'])
  })
}

const policy = JSON.parse(await readFile(new URL('tests/reference/physical-base/inputs.json', root))).cases
const characterization = JSON.parse(await readFile(new URL('tests/reference/physical-base/expected.json', root)))
assert.equal(characterization.corpus_sha256, createHash('sha256').update(JSON.stringify(policy)).digest('hex'))
const policyReceipts = new Map(characterization.cases.map(item => [item.name, item]))
for (const item of policy) test(item.name + ' remains incomplete without a physical parent directory', async () => {
  assertInputBytes(item, policyReceipts.get(item.name))
  const files = new Map(Object.entries(item.files)), options = {contexts: new Map(Object.entries(item.contexts ?? {}))}
  const actual = await validateCrate(files, options)
  assert.deepEqual(actual, {status: 'incomplete', stage: 'preflight',
    reason: 'RDF identifiers depend on a physical parent directory outside the selected crate.',
    report: {highest_error_level: null, issues: {CRITICAL: [], ERROR: [], WARNING: [], INFO: [], DEBUG: []}}})
  assert.deepEqual(await validateCrate(files, options), actual)
})

test('native entropy isolates both the crate and its immediate parent without input rewrites', () => {
  const first = createCrateIdentity(), second = createCrateIdentity()
  assert.notEqual(first.baseURL, second.baseURL)
  const rootURL = new URL('.', first.baseURL).href
  const parentURL = new URL('..', rootURL).href
  assert.notEqual(rootURL, 'file:///crate/')
  assert.notEqual(parentURL, 'file:///')
  const absolute = 'file:///crate/ and file:///bijux-ro-crate-' + '0'.repeat(32) + '/'
  const report = {highest_error_level: 'ERROR', issues: {ERROR: [{severity: 40,
    message: `Found undefined references: ${rootURL}b, ${absolute}, ${rootURL}a`,
    location_description: parentURL + 'sibling'}]}}
  const result = first.render({status: 'incomplete', stage: 'preflight', reason: first.baseURL, report})
  assert.equal(result.reason, 'crate:/ro-crate-metadata.json')
  assert.equal(result.report.issues.ERROR[0].location_description, 'crate:/../sibling')
  assert.equal(result.report.issues.ERROR[0].message,
    `Found undefined references: crate:/a, crate:/b, ${absolute}`)
  assert.equal(report.issues.ERROR[0].location_description, parentURL + 'sibling')
})

test('missing native entropy remains incomplete and cannot approve submission', async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  Object.defineProperty(globalThis, 'crypto', {configurable: true, value: undefined})
  try {
    const item = cases.find(item => item.name === 'root-reference/duplicate-relative-root')
    const result = await validateCrate(new Map(Object.entries(item.files)))
    assert.equal(result.status, 'incomplete')
    assert.equal(result.stage, 'input')
    assert.equal(result.reason, 'Validation requires native cryptographic randomness.')
    assert.equal(result.report.highest_error_level, null)
  } finally {Object.defineProperty(globalThis, 'crypto', saved)}
})
