import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile, writeFile, mkdir, mkdtemp, rm} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {validateCrate} from '../../src/index.js'
import {cases, assertResult, limits} from '../../../../tests/reference/inferred-collections/checks.mjs'

const samples = ['profile-falsy-head/empty-plain-masks-missing-name',
  'collection-witnesses/complete/head/empty-plain-inferred-name',
  'collection-pairs/disjoint-properties-last-pair', 'owl-errors/alldifferent-2-members']
for (const name of samples) test(name + ' enforces its exact result and immutable input contract', async () => {
  const item = cases.find(row => row.name === name)
  const result = await validateCrate(new Map(Object.entries(item.files)),
    {contexts: new Map(Object.entries(item.contexts ?? {}))})
  assertResult(item, result)
  for (const mutate of [
    row => {row.name = 'unregistered-collection'},
    row => {row.files['ro-crate-metadata.json'] += '\n'},
    row => {row.files['unregistered.txt'] = 'extra'},
    row => {row.contexts = {'https://example.test/context': {'@context': {}}}},
    row => {row.observe_error_nodes = !row.observe_error_nodes},
  ]) {
    const changed = structuredClone(item)
    mutate(changed)
    assert.throws(() => assertResult(changed, result))
  }
  const changedResult = structuredClone(result)
  changedResult.status = result.status === 'valid' ? 'invalid' : 'valid'
  assert.throws(() => assertResult(item, changedResult))
  const extraFinding = structuredClone(result)
  extraFinding.report.issues.INFO.push({message: 'Unrelated finding', severity: 20, location_description: null})
  assert.throws(() => assertResult(item, extraFinding))
  if (limits.has(name)) {
    const unrelated = structuredClone(result)
    unrelated.reason = 'unrelated interruption'
    assert.throws(() => assertResult(item, unrelated))
  }
  const original = item.files['ro-crate-metadata.json']
  try {
    item.files['ro-crate-metadata.json'] += '\n'
    assert.throws(() => assertResult(item, result))
  } finally {item.files['ro-crate-metadata.json'] = original}
})

test('fresh capture verification rejects exception and generated-node provenance changes', async () => {
  const root = new URL('../../../../', import.meta.url)
  await mkdir(new URL('artifacts/work/', root), {recursive: true})
  const directory = await mkdtemp(fileURLToPath(new URL('artifacts/work/collection-capture-', root)))
  try {
    const original = JSON.parse(await readFile(new URL('tests/reference/inferred-collections/original.json', root)))
    const corrected = JSON.parse(await readFile(new URL('tests/reference/inferred-collections/corrected.json', root)))
    const changes = [
      ['original', original, data => {data.cases.find(row => row.exception).exception.type = 'UnregisteredException'}],
      ['corrected', corrected, data => {data.collection_correction.capture_sha256 = '0'.repeat(64)}],
      ['corrected', corrected, data => {
        data.cases.find(row => row.generated_error_nodes?.length).generated_error_nodes[0].provenance = 'unregistered-observer'
      }],
    ]
    for (const [mode, source, mutate] of changes) {
      const data = structuredClone(source)
      mutate(data)
      const path = directory + '/capture.json'
      await writeFile(path, JSON.stringify(data))
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('tests/reference/inferred-collections/verify-capture.mjs', root)), mode, path],
        {encoding: 'utf8', timeout: 20000})
      assert.notEqual(result.status, 0)
      assert.ok(result.stderr)
    }
  } finally {await rm(directory, {recursive: true, force: true})}
})

for (const name of ['datatype-sameas-derived', 'datatype-sameas-explicit-datatype-control'])
test(name + ' exception-order equivalence preserves every child and unrelated field', async () => {
  const {assertCaptureRecord} = await import('../../../../tests/reference/inferred-collections/capture-records.mjs')
  const ordinaryReference = JSON.parse(await readFile(new URL('../../../../tests/reference/inferred-collections/ordinary-reference.json', import.meta.url)))
  const row = ordinaryReference.cases.find(item => item.name === name)
  const reordered = structuredClone(row)
  reordered.exception.children.reverse()
  assertCaptureRecord(reordered, row)
  for (const mutate of [
    item => {item.exception.children[0].message += ' changed'},
    item => {item.exception.children[0].type = 'UnknownException'},
    item => {item.exception.message += ' changed'},
    item => {item.exception.children.pop()},
    item => {item.inputs_sha256['ro-crate-metadata.json'] = '0'.repeat(64)},
  ]) {
    const changed = structuredClone(reordered)
    mutate(changed)
    assert.throws(() => assertCaptureRecord(changed, row))
  }
  const unrelated = structuredClone(reordered), other = structuredClone(row)
  unrelated.name = other.name = 'another-collection'
  assert.throws(() => assertCaptureRecord(unrelated, other))
})
