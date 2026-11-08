import test from 'node:test'
import assert from 'node:assert/strict'
import {compareResult} from './compare.mjs'
import {normalizeReport, portableCase} from './normalize.mjs'
const report = node => ({highest_error_level: 'ERROR', issues: {CRITICAL: [], ERROR: [
  {message: 'A WebSite MUST have a `name` property', severity: 40, location_description: 'At ro-crate object with @id: ' + node},
], WARNING: [], INFO: [], DEBUG: []}})
const receipt = {node: 'N0123456789abcdef0123456789abcdef', comparison_node: 'owl-error-0',
  message: 'Irreflexive property used on file:///capture/ with urn:property', provenance: 'owlrl-7.1.4/closure-created-error-message'}
const expected = {name: 'generated-error', status: 'invalid', report: report(receipt.node), root: '/capture', root_uri: 'file:///capture', generated_error_nodes: [receipt], exception: null}
const actual = {status: 'invalid', report: report('owl-error-0')}

test('only observed generated OWL focus identities map between implementations', () => {
  compareResult(actual, expected, expected.name)
  const stable = portableCase(expected)
  assert.equal(stable.generated_error_nodes[0].node, 'owl-error-0')
  assert.equal(stable.generated_error_nodes[0].message, 'Irreflexive property used on crate:/ with urn:property')
  compareResult(actual, stable, expected.name)
  assert.deepEqual(portableCase(stable), stable)
})
for (const [name, mutate] of [
  ['unknown actual blank identity', value => {value.report.issues.ERROR[0].location_description = 'At ro-crate object with @id: other'}],
  ['changed message', value => {value.report.issues.ERROR[0].message = 'another finding'}],
  ['removed finding', value => {value.report.issues.ERROR = []; value.report.highest_error_level = null}],
  ['duplicate finding', value => {value.report.issues.ERROR.push({...value.report.issues.ERROR[0]})}],
]) test(name + ' stays a strict mismatch', () => {
  const changed = structuredClone(actual); mutate(changed)
  assert.throws(() => compareResult(changed, expected, expected.name))
})
test('preexisting ErrorMessage and arbitrary blank identities have no implicit mapping', () => {
  const preexisting = {...expected, generated_error_nodes: [], report: report('user-error')}
  assert.throws(() => compareResult(actual, preexisting, expected.name))
  assert.equal(normalizeReport(report('Nffffffffffffffffffffffffffffffff'), '', '').issues.ERROR[0].location_description,
    'At ro-crate object with @id: Nffffffffffffffffffffffffffffffff')
})
test('generated-node receipts do not rewrite message text or unrelated locations', () => {
  const original = report('unrelated'); original.issues.ERROR[0].message = receipt.node
  const normalized = normalizeReport(original, '', '', {generatedErrorNodes: [receipt]})
  assert.deepEqual(normalized, original)
})
