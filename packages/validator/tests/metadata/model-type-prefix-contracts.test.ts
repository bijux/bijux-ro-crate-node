import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {validateCrate} from '../../src/index.js'
import type {ValidationResult} from '../../src/index.js'
import type {ReferenceCase, ReferenceExpected} from '../../../../tests/parity/reference-fixtures.js'
import {cases, assertResult, assertCapture, originalByName, approvedDifferences} from '../../../../tests/reference/model-type-prefixes/checks.mjs'

type Case = ReferenceCase & {contexts?: Record<string, unknown>}
type CaptureCase = ReferenceExpected & {report: ValidationResult['report']; exception: unknown; inputs_sha256: Record<string, string>}
type Capture = {commit: string; cases: CaptureCase[]}
type MutableResult = {status: string; report: ValidationResult['report']; stage?: string; reason?: string}

const folder = new URL('../../../../tests/reference/model-type-prefixes/', import.meta.url)
const original: Capture = JSON.parse(await readFile(new URL('original.json', folder), 'utf8'))
const registered: Case[] = structuredClone(cases), results = new Map<string, ValidationResult>()
for (const item of registered) results.set(item.name, await validateCrate(new Map(Object.entries(item.files)),
  {contexts: new Map(Object.entries(item.contexts ?? {}))}))
for (const item of registered) test(item.name + ' retains its unchanged-main outcome', () => assertResult(item, results.get(item.name)!))

test('model-type prefix contracts refuse changed input bytes, contexts and results', () => {
  let rejected = 0
  for (const item of registered) {
    for (const mutate of [(value: Case) => value.name += '-unknown', (value: Case) => value.files['ro-crate-metadata.json'] += ' ',
      (value: Case) => value.files.extra = 'extra', (value: Case) => value.contexts = {'https://example.org/other': {'@context': {}}}]) {
      const value = structuredClone(item); mutate(value)
      assert.throws(() => assertResult(value, results.get(item.name)!)); rejected++
    }
    for (const mutate of [(value: MutableResult) => value.status = value.status === 'valid' ? 'invalid' : 'valid',
      (value: MutableResult) => value.report.highest_error_level = value.report.highest_error_level === null ? 'ERROR' : null,
      (value: MutableResult) => value.report.issues.INFO.push({message: 'extra', severity: 20, location_description: null})]) {
      const value: MutableResult = structuredClone(results.get(item.name)!); mutate(value)
      assert.throws(() => assertResult(item, value as ValidationResult)); rejected++
    }
  }
  assert.equal(rejected, 140)
  for (const item of registered.filter(row => row.name.includes('/unflattened-map/'))) for (const field of ['stage', 'reason'] as const) {
    const value: MutableResult = structuredClone(results.get(item.name)!); value[field] = 'other'
    assert.throws(() => assertResult(item, value as ValidationResult))
  }
})

test('model-type capture contracts bind every unchanged-main report and original byte', async () => {
  assert.equal(approvedDifferences.size, 0)
  assertCapture(original, 'original')
  assert.throws(() => assertCapture(original, 'corrected'))
  for (const mutate of [(value: Capture) => value.cases.pop(), (value: Capture) => value.cases[0].name += '-unknown',
    (value: Capture) => value.cases[0].inputs_sha256['ro-crate-metadata.json'] = '0'.repeat(64),
    (value: Capture) => value.cases[0].report.issues.ERROR.pop(), (value: Capture) => value.cases[0].exception = null,
    (value: Capture) => value.commit = '0'.repeat(40)]) {
    const value = structuredClone(original); mutate(value)
    assert.throws(() => assertCapture(value, 'original'))
  }
  const proof = JSON.parse(await readFile(new URL('proof.json', folder), 'utf8'))
  assert.equal(proof.proof_source_sha256, createHash('sha256').update(await readFile(new URL('prove.py', folder))).digest('hex'))
  assert.equal(proof.pairs.length, 5)
  for (const pair of proof.pairs) {
    assert.equal(pair.projected_models.length, 2)
    assert.deepEqual(pair.projected_models, pair.full_context_models)
  }
})

test('exported model-type data and assertion errors cannot rewrite private reference contracts', () => {
  const saved = cases[0].files['ro-crate-metadata.json'], before = originalByName.get(registered[0].name)
  try {
    cases[0].files['ro-crate-metadata.json'] += ' '
    assert.throws(() => assertResult(cases[0], results.get(registered[0].name)!))
    originalByName.set(registered[0].name, {status: 'valid'} as NonNullable<typeof before>); approvedDifferences.add(registered[0].name)
    assertResult(registered[0], results.get(registered[0].name)!); assertCapture(original, 'original')
    const changed = structuredClone(original); changed.cases.pop()
    let exposed
    try {assertCapture(changed, 'original')} catch (error) {if (error instanceof assert.AssertionError) exposed = error.expected as Capture}
    assert.ok(exposed)
    assert.throws(() => exposed.cases.pop(), TypeError)
    assertCapture(original, 'original')
  } finally {
    cases[0].files['ro-crate-metadata.json'] = saved; originalByName.set(registered[0].name, before!); approvedDifferences.clear()
  }
})
