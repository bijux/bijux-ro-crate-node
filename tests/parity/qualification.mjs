import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {portableCase} from './normalize.mjs'
import {assertInputBytes} from './inputs.mjs'

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)))
const hash = value => createHash('sha256').update(value).digest('hex')
const freeze = value => {
  if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value)}
  return value
}
const folder = '../reference/competing-collections/'
const registered = freeze(read(folder + 'inputs.json').cases)
const contract = freeze(read(folder + 'correction.json'))
const pin = read('../../docs/compatibility/reference.json')
const captureHash = hash(readFileSync(new URL(folder + 'capture.py', import.meta.url)))
assert.equal(pin.commit, contract.reference)
assert.equal(pin.kind, 'merged-main')
assert.equal(hash(readFileSync(new URL(folder + 'inputs.json', import.meta.url))), contract.inputs_sha256)
assert.equal(hash(readFileSync(new URL(folder + 'guard.py', import.meta.url))), contract.guard_sha256)
assert.equal(registered.length, 151)
const registeredMap = new Map(registered.map(item => [item.name, item]))
assert.equal(registeredMap.size, registered.length)
export const registeredCollections = structuredClone(registered)
const portable = ({imported_module: _module, ...capture}) => ({...capture, cases: capture.cases.map(portableCase)})
const stamp = cases => ({...contract, capture_sha256: captureHash,
  observations: cases.map(item => ({name: item.name, role: contract.role}))})

export function collectionCases(cases) {
  const selected = cases.filter(item => registeredMap.has(item.name))
  for (const item of selected) {
    assert.deepEqual(item, registeredMap.get(item.name), 'Registered collection bytes or contexts changed')
    assert.equal(JSON.stringify(item), JSON.stringify(registeredMap.get(item.name)), 'Registered collection order changed')
  }
  assert.deepEqual(selected.map(item => item.name), registered.filter(item => selected.some(row => row.name === item.name)).map(item => item.name))
  return selected
}

function assertCapture(cases, capture) {
  assert.equal(capture.commit, pin.commit)
  assert.equal(capture.corpus_sha256, hash(JSON.stringify(cases)))
  assert.deepEqual(capture.cases.map(row => row.name), cases.map(item => item.name))
  for (const [index, item] of cases.entries()) assertInputBytes(item, capture.cases[index])
}

/** Original main and corrected qualification retain distinct provenance and counts. */
export function qualifyCapture(cases, original, corrected) {
  const selected = collectionCases(cases)
  if (!selected.length && corrected === undefined)
    corrected = {...original, corpus_sha256: hash('[]'), cases: [], collection_correction: stamp([])}
  assertCapture(cases, original)
  assertCapture(selected, corrected)
  assert.deepEqual(corrected.collection_correction, stamp(selected))
  const corrections = new Map(corrected.cases.map(row => [row.name, row]))
  const qualifiedRecords = new Map(read(folder + 'corrected.json').cases.map(row => [row.name, row]))
  for (const row of corrected.cases) {
    assert.deepEqual(portableCase(row), qualifiedRecords.get(row.name), 'Fresh collection qualification differs from its registered record')
    assert.equal(row.status, 'invalid')
    assert.equal(row.exception?.type, 'ExceptionGroup')
    assert.ok(row.exception.children?.length)
    assert.ok(row.exception.children.every(child => child.type === 'Exception'), 'Instrumentation error in qualified reference')
    assert.ok(row.report.issues.ERROR.some(issue => issue.message.startsWith('Ambiguous RDF collection: multiple values for ')))
  }
  const dispositions = selected.map(item => {
    const row = corrections.get(item.name)
    return {name: item.name, disposition: 'known-upstream-collection-defect', inputs_sha256: row.inputs_sha256,
      qualified_record_sha256: hash(JSON.stringify(portableCase(row)))}
  })
  return {...original, kind: 'qualified-main', cases: original.cases.map(row => corrections.get(row.name) ?? row),
    collection_qualification: {correction: stamp(selected), dispositions,
      raw_capture_sha256: hash(JSON.stringify(portable(original))),
      ordinary_exact_cases: cases.length - selected.length, qualified_collection_cases: selected.length}}
}

/** Checked-in public expectations cannot silently substitute corrected reports for raw main. */
export function assertQualifiedSnapshot(snapshot) {
  const original = read('./expected/original-crates.json')
  const corrected = read(folder + 'corrected.json')
  assert.equal(snapshot.kind, 'qualified-main')
  assert.equal(snapshot.commit, pin.commit)
  assert.equal(original.commit, pin.commit)
  assert.equal(snapshot.corpus_sha256, original.corpus_sha256)
  assert.deepEqual(corrected.collection_correction, stamp(registered))
  const raw = new Map(original.cases.map(row => [row.name, row]))
  const correctedMap = new Map(corrected.cases.map(row => [row.name, row]))
  assert.deepEqual(snapshot.cases.map(row => row.name), original.cases.map(row => row.name))
  assert.equal(snapshot.collection_qualification.raw_capture_sha256, hash(JSON.stringify(original)))
  assert.equal(snapshot.collection_qualification.ordinary_exact_cases, original.cases.length - 151)
  assert.equal(snapshot.collection_qualification.qualified_collection_cases, 151)
  assert.deepEqual(snapshot.collection_qualification.correction, stamp(registered))
  assert.deepEqual(snapshot.collection_qualification.dispositions, registered.map(item => {
    const row = correctedMap.get(item.name)
    assertInputBytes(item, raw.get(item.name)); assertInputBytes(item, row)
    return {name: item.name, disposition: 'known-upstream-collection-defect', inputs_sha256: row.inputs_sha256,
      qualified_record_sha256: hash(JSON.stringify(row))}
  }))
  for (const row of snapshot.cases) assert.deepEqual(row, correctedMap.get(row.name) ?? raw.get(row.name))
  return snapshot
}

/** Supplemental dependency proofs explicitly carry their composed collection guard. */
export function assertSupplementalQualification(value, cases, registration) {
  assert.ok(Object.hasOwn(contract.supplemental_inputs, registration))
  assert.deepEqual(value, {reference: contract.reference, metadata_reference_sha256: contract.metadata_reference_sha256,
    guard_sha256: contract.guard_sha256, registration, inputs_sha256: contract.supplemental_inputs[registration],
    helper_sha256: hash(readFileSync(new URL(folder + 'qualification.py', import.meta.url))),
    observations: cases.map(item => ({name: item.name, role: contract.role}))})
}
