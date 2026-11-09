import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {assertInputBytes} from '../../parity/inputs.mjs'
import {compareResult} from '../../parity/compare.mjs'

const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url)))
const registeredCases = (await read('inputs.json')).cases
const capture = await read('python.json'), counterparts = await read('counterparts.json')
const pin = await read('../../../docs/compatibility/reference.json')
const inputs = new Map(registeredCases.map(item => [item.name, item]))
const originals = new Map(capture.cases.map(row => [row.name, row]))
const expected = new Map(registeredCases.map(item => [item.name, originals.get(counterparts[item.name] ?? item.name)]))
const differences = new Set(Object.keys(counterparts))
const rejectedNames = new Set(registeredCases.filter(item => expected.get(item.name).status === 'invalid').map(item => item.name))
assert.equal(capture.commit, pin.commit)
assert.equal(capture.corpus_sha256, createHash('sha256').update(JSON.stringify(registeredCases)).digest('hex'))
assert.deepEqual(capture.cases.map(row => row.name), registeredCases.map(item => item.name))
assert.equal(inputs.size, 27)
assert.equal(differences.size, 5)

const contributor = document => document['@graph'].find(item => item['@type']?.includes('bia:Contributor'))
for (const item of registeredCases) {
  assertInputBytes(item, originals.get(item.name))
  if (!differences.has(item.name)) continue
  const counterpart = inputs.get(counterparts[item.name])
  assert.ok(counterpart && !differences.has(counterpart.name), item.name)
  const source = JSON.parse(item.files['ro-crate-metadata.json'])
  const target = JSON.parse(counterpart.files['ro-crate-metadata.json'])
  const originalURL = contributor(source).website
  if (item.name === 'url-authorities/userinfo/empty-eof') {
    assert.equal(originalURL, 'a://@')
    contributor(source).website = originalURL + '/'
  } else {
    assert.ok(item.name.startsWith('url-authorities/port/'))
    assert.match(originalURL, /^a:\/\/b:\d*\\/)
    contributor(source).website = originalURL.replace('\\', 'x')
  }
  // Only the website spelling changes; the complete finding comes from an
  // unchanged-Python rejected counterpart, not from a synthesized Node report.
  assert.deepEqual(source, target, item.name)
  const rest = files => Object.fromEntries(Object.entries(files).filter(([name]) => name !== 'ro-crate-metadata.json'))
  assert.deepEqual(rest(item.files), rest(counterpart.files), item.name)
  assert.deepEqual(item.contexts ?? {}, counterpart.contexts ?? {}, item.name)
  assert.equal(originals.get(item.name).status, 'valid', item.name)
  assert.equal(expected.get(item.name).status, 'invalid', item.name)
}

export const cases = structuredClone(registeredCases)
export const originalByName = structuredClone(originals)
export const python = originalByName
export const approvedDifferences = new Set(differences)
export const rejected = new Set(rejectedNames)
export const reference = Object.freeze({reference: pin.commit, suite_sha256: capture.corpus_sha256})

/** Only these two proven URL parser defects use rejected Python counterparts. */
export function assertResult(item, result) {
  assert.ok(inputs.has(item.name), 'Unregistered URL authority input: ' + item.name)
  assert.deepEqual(item, inputs.get(item.name), 'URL authority input differs from its registration')
  assert.equal(JSON.stringify(item), JSON.stringify(inputs.get(item.name)), 'URL authority context order differs')
  assertInputBytes(item, originals.get(item.name))
  compareResult(result, expected.get(item.name), item.name)
  if (differences.has(item.name))
    assert.throws(() => compareResult(result, originals.get(item.name), item.name), /Completion status differs/)
}
