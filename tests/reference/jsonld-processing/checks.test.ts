import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {cases, assertResult, referenceByName, originalByName, approvedDifferences} from './checks.mjs'

import type {ValidationResult} from '../../../packages/validator/src/index.js'

type Case = typeof cases[number]
type Spec = {name: string; reason?: string}
type ErrorDetail = {type: string; code: string; message: string}
type CapturedCase = {name: string; status: string; exception: {type: string; message: string}}
type Observation = {name: string; role: string; stage: string; error?: ErrorDetail}
type Result = {status: string; report: {highest_error_level: string | null; issues: Record<string, Array<{message: string; severity: number; location_description: string | null}>>}; reason?: string}
const read = async <T,>(name: string): Promise<T> => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8')) as T
const specs = new Map((await read<{cases: Spec[]}>('contract.json')).cases.map(item => [item.name, item]))
const captured = await read<{cases: CapturedCase[]; jsonld_graph_correction: {observations: Observation[]}}>('corrected.json')
const direct = new Map((await read<{cases: Array<{name: string; error?: ErrorDetail}>}>('direct.json')).cases.map(item => [item.name, item]))
test('every interrupted capture retains its original JSON-LD exception and complete observation', () => {
  const observations = captured.jsonld_graph_correction.observations
  assert.deepEqual(observations.map(item => item.name), captured.cases.map(item => item.name))
  assert.equal(captured.cases.filter(item => item.status === 'incomplete').length, 39)
  for (const [index, item] of captured.cases.entries()) {
    const observation = observations[index], spec = specs.get(item.name)
    assert.ok(spec)
    assert.equal(observation.role, 'metadata reference graph', item.name)
    if (!spec.reason) {
      assert.equal(observation.stage, 'default graph populated', item.name)
      assert.equal(observation.error, undefined, item.name)
      continue
    }
    assert.equal(item.status, 'incomplete', item.name)
    assert.equal(item.exception.type, 'JsonLdError', item.name)
    const error = direct.get(item.name)?.error
    assert.ok(error)
    const message = error.code === 'invalid value object'
      ? 'Invalid JSON-LD syntax; Attempt to add illegal key to value object: @id.' : spec.reason
    assert.deepEqual(observation.error, {...error, message}, item.name)
    assert.equal(observation.stage, error.code === 'invalid typed value' ? 'expanded value validation' : 'expansion', item.name)
    assert.ok(item.exception.message.includes('\nType: ' + error.type + '\nCode: ' + error.code), item.name)
  }
})
// Reference snapshots contain comparison fields rather than the full runtime result.
const result = (item: Case): Result => {
  const expected = referenceByName.get(item.name), spec = specs.get(item.name)
  assert.ok(expected && spec)
  return {status: expected.status as string, report: structuredClone(expected.report) as Result['report'],
    ...(spec.reason ? {reason: spec.reason} : {})}
}
const checkResult = (item: Case, value: Result) => assertResult(item, value as ValidationResult)
const completed = cases.find(item => referenceByName.get(item.name)?.status === 'invalid')
const interrupted = cases.find(item => referenceByName.get(item.name)?.status === 'incomplete')
const valid = cases.find(item => referenceByName.get(item.name)?.status === 'valid')
const remote = cases.find(item => item.name.includes('/remote-local/'))
assert.ok(completed && interrupted && valid && remote)
for (const item of [completed, interrupted, valid]) test(item.name + ' accepts only its complete contract', () => checkResult(item, result(item)))
for (const [name, mutate] of [
  ['unknown identity', item => {item.name += '/other'}],
  ['metadata bytes', item => {item.files['ro-crate-metadata.json'] += ' '}],
  ['added file', item => {item.files['other.tsv'] = 'x'}],
  ['removed file', item => {delete item.files['file_list.tsv']}],
  ['added context', item => {item.contexts = {...item.contexts, 'https://example.org/other': {'@context': {}}}}],
  ['extra input field', item => {Reflect.set(item, 'extra', true)}],
] satisfies Array<[string, (item: Case) => void]>) test('registration rejects ' + name, () => {
  const item = structuredClone(completed); mutate(item)
  assert.throws(() => checkResult(item, result(completed)))
})
test('remote context changes cannot reuse the counterpart report', () => {
  const item = structuredClone(remote)
  assert.ok(item.contexts)
  item.contexts['https://example.org/local-context']['@context'].extra = 'urn:other'
  assert.throws(() => checkResult(item, result(remote)))
})
for (const [name, mutate] of [
  ['status', value => {value.status = 'valid'}],
  ['unexpected finding', value => {value.report.issues.ERROR.push({message: 'extra', severity: 40, location_description: null}); value.report.highest_error_level = 'ERROR'}],
  ['lost finding', value => {for (const rows of Object.values(value.report.issues)) rows.length = 0; value.report.highest_error_level = null}],
  ['finding severity', value => {const row = Object.values(value.report.issues).flat()[0]; row.severity = 10}],
] satisfies Array<[string, (value: Result) => void]>) test('completed result rejects changed ' + name, () => {
  const value = result(completed); mutate(value)
  assert.throws(() => checkResult(completed, value))
})
for (const reason of [undefined, 'datatype.startsWith is not a function', 'generic failure'])
  test('interruption reason cannot be replaced by ' + reason, () => {
    const value = result(interrupted); value.reason = reason
    assert.throws(() => checkResult(interrupted, value))
  })
test('every declared difference refuses the unchanged upstream result', () => {
  assert.equal(approvedDifferences.size, 72)
  for (const item of cases.filter(item => approvedDifferences.has(item.name)))
    assert.throws(() => assertResult(item, originalByName.get(item.name) as ValidationResult), item.name)
})
test('exported observations cannot change private expectations', () => {
  const before = referenceByName.get(completed.name)
  assert.ok(before)
  referenceByName.set(completed.name, {...before, status: 'valid', report: result(valid).report})
  try {assert.throws(() => assertResult(completed, referenceByName.get(completed.name) as ValidationResult))}
  finally {referenceByName.set(completed.name, before)}
})
test('in-place mutation of exported input bytes cannot replace private registration', () => {
  const before = completed.files['ro-crate-metadata.json']
  completed.files['ro-crate-metadata.json'] += ' '
  try {assert.throws(() => checkResult(completed, result(completed)))}
  finally {completed.files['ro-crate-metadata.json'] = before}
})
