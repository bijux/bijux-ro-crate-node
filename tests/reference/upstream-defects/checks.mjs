import {registeredInputGuard} from '../runtime/input-ownership.mjs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {compareResult} from '../../parity/compare.mjs'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {correctedConstraintReport} from './constraint-report.mjs'
import {cases as literals, assertPolicyResult, datasetTargets, failOpen, python as literalPython} from '../profile-literal-targets/checks.mjs'
import {cases as disabled, assertResult as assertDisabledResult, originalByName as disabledPython,
  rejected as disabledRejected, approvedDifferences as disabledDifferences} from '../disabled-context-terms/checks.mjs'
import {cases as rootContexts, assertResult as assertRootResult, originalByName as rootPython,
  rejected as rootRejected, approvedDifferences as rootDifferences} from '../root-context-propagation/checks.mjs'
import {cases as diagnostics, assertDiagnosticResult, originalByName, correctedByName} from '../blank-node-diagnostics/checks.mjs'
import * as urls from '../url-authorities/checks.mjs'
import * as temporal from '../temporal-literals/checks.mjs'
import * as keys from '../key-equality/checks.mjs'
import * as manifests from '../manifest-inference/checks.mjs'
import * as graphs from '../jsonld-graph-contexts/checks.mjs'

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url)))
const {cases: converters} = await read('../converter-failures/inputs.json')
const converterPython = await read('../converter-failures/expected.json')
const converterRecords = new Map(converterPython.cases.map(row => [row.name, row]))
const pin = await read('../../../docs/compatibility/reference.json')
assert.equal(converterPython.commit, pin.commit)
assert.equal(converterPython.corpus_sha256, createHash('sha256').update(JSON.stringify(converters)).digest('hex'))
export const cases = [...literals, ...converters, ...diagnostics, ...disabled, ...rootContexts, ...urls.cases, ...keys.cases, ...manifests.cases, ...temporal.cases, ...graphs.cases]
const assertRegisteredInput = registeredInputGuard(cases)
assert.equal(new Set(cases.map(item => item.name)).size, cases.length)
const capturedRecords = structuredClone(new Map([...literalPython, ...converterPython.cases.map(row => [row.name, row]), ...originalByName, ...disabledPython, ...rootPython, ...urls.originalByName, ...keys.originalByName, ...manifests.originalByName, ...temporal.originalByName, ...graphs.originalByName]))
for (const item of cases) assertInputBytes(item, capturedRecords.get(item.name))
const literalNames = new Set(literals.map(item => item.name)), diagnosticNames = new Set(diagnostics.map(item => item.name))
const disabledNames = new Set(disabled.map(item => item.name))
const rootNames = new Set(rootContexts.map(item => item.name))
const urlNames = new Set(urls.cases.map(item => item.name))
const keyNames = new Set(keys.cases.map(item => item.name))
const manifestNames = new Set(manifests.cases.map(item => item.name))
const temporalNames = new Set(temporal.cases.map(item => item.name))
const graphNames = new Set(graphs.cases.map(item => item.name))
const converterFailures = new Set(converters.filter(item => item.name.endsWith('unnamed-website')).map(item => item.name))
const expectedRejected = new Set([...datasetTargets, ...converterFailures, ...disabledRejected, ...rootRejected, ...urls.rejected, ...keys.rejected, ...manifests.rejected, ...temporal.rejected, ...graphs.rejected,
  ...diagnostics.filter(item => correctedByName.get(item.name).status === 'invalid').map(item => item.name)])
export const approvedDifferences = new Set([...failOpen, ...converterFailures, ...disabledDifferences, ...rootDifferences, ...urls.approvedDifferences, ...keys.approvedDifferences, ...manifests.approvedDifferences, ...temporal.approvedDifferences, ...graphs.approvedDifferences,
  ...diagnostics.filter(item => JSON.stringify(correctedByName.get(item.name).report) !== JSON.stringify(originalByName.get(item.name).report)).map(item => item.name)])
export const reference = {reference: pin.commit,
  suite_sha256: createHash('sha256').update(JSON.stringify(cases)).digest('hex')}
assert.equal(cases.length, 123)
assert.equal(approvedDifferences.size, 54)
assert.equal(expectedRejected.size, 67)

/** Confirmed defects have explicit constraint contracts; all agreeing controls stay exact. */
export function assertUpstreamResult(item, result) {
  assertRegisteredInput(item)
  if (literalNames.has(item.name)) assertPolicyResult(item, result)
  else if (diagnosticNames.has(item.name)) assertDiagnosticResult(item, result)
  else if (disabledNames.has(item.name)) assertDisabledResult(item, result)
  else if (rootNames.has(item.name)) assertRootResult(item, result)
  else if (urlNames.has(item.name)) urls.assertResult(item, result)
  else if (keyNames.has(item.name)) keys.assertResult(item, result)
  else if (manifestNames.has(item.name)) manifests.assertResult(item, result)
  else if (temporalNames.has(item.name)) temporal.assertResult(item, result)
  else if (graphNames.has(item.name)) graphs.assertResult(item, result)
  else if (converterFailures.has(item.name)) {
    assert.equal(converterRecords.get(item.name).status, 'valid')
    assert.equal(result.status, 'invalid', item.name)
    compareResult(result, {...converterRecords.get(item.name), status: 'invalid',
      report: correctedConstraintReport(converterRecords.get(item.name), {
        message: 'A WebSite MUST have a `name` property', severity: 40,
        location_description: 'At ro-crate object with @id: ./#unnamed'})}, item.name)
    assert.throws(() => compareResult(result, converterRecords.get(item.name), item.name), /Completion status differs/)
  } else compareResult(result, converterRecords.get(item.name), item.name)
  assert.equal(result.status, expectedRejected.has(item.name) ? 'invalid' : 'valid', item.name)
}

// Inspection snapshots cannot change the private comparison records.
export const python = structuredClone(capturedRecords)
export const rejected = new Set(expectedRejected)
