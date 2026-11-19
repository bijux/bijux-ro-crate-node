import type {ReferenceCase, ReferenceExpected} from '../../../../tests/parity/reference-fixtures.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {rdfDataset} from '../../src/metadata/rdf/dataset.js'
import {jsonld, jsonldOptions} from '../../src/metadata/jsonld.js'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'

const input: {cases: ReferenceCase[]} = JSON.parse(await readFile(new URL('../../../../tests/parity/inputs/rdf-member-order.json', import.meta.url), 'utf8'))
const oracle: {cases: ReferenceExpected[]} = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/crates.json', import.meta.url), 'utf8'))
for (const item of input.cases) {
  test(item.name + ' retains the first RDF constructor value through aliases', async () => {
    const expected = oracle.cases.find(c => c.name === item.name)
    assert.ok(expected, 'Missing independent Python expectation')
    assertInputBytes(item, expected)
    compareResult(await validateCrate(new Map(Object.entries(item.files))), expected, item.name)
  })
}

test('RDF expansion owns its member-order copy and preserves caller documents', async () => {
  const document = {'@context': {a: 'https://example.org/p', b: 'https://example.org/p'},
    '@id': 'https://example.org/s', b: 1, a: '1'}
  const original = structuredClone(document)
  await rdfDataset(document)
  assert.deepEqual(document, original)
  const expanded = await jsonld.expand(document, jsonldOptions({}))
  const node = expanded[0] as Record<string, Array<{ '@value': unknown }>>
  const values = node['https://example.org/p']
  assert.deepEqual(values.map(value => value['@value']), ['1', 1])
  assert.deepEqual(document, original)
})
