import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'
import {referenceDatatype} from '../../../src/metadata/rdf/literals/datatype-aliases.js'
import {jsonld, jsonldOptions, rdfOptions} from '../../../src/metadata/jsonld.js'
import {localLoader} from '../../../src/profile/loader.js'

const bytes = await readFile(new URL('../../../../../tests/parity/contexts/import-keywords.json', import.meta.url))
const input = JSON.parse(bytes)
const oracle = JSON.parse(await readFile(new URL('../../../../../tests/parity/expected/import-keywords.json', import.meta.url)))
assert.equal(createHash('sha256').update(bytes).digest('hex'), oracle.inputs_sha256)
assert.equal(input.cases.length, oracle.cases.length)
const order = (a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0

for (const item of input.cases) test(item.name + ' retains imported keyword semantics', async () => {
  const expected = oracle.cases.find(value => value.name === item.name)
  assert.ok(expected)
  const original = structuredClone(item)
  const options = {baseURL: item.base, documentLoader: localLoader(new Map(Object.entries(item.contexts)))}
  assert.notEqual(jsonldOptions(options).contextResolver, rdfOptions(options).contextResolver)
  assert.equal(jsonldOptions(options).rdfLibImportKeywords, undefined)
  assert.equal(rdfOptions(options).pyldContextKeywords, undefined)
  const rdf = async () => {
    if (!expected.rdf) return
    if (expected.rdf.exception) return assert.rejects(rdfDataset(item.document, options))
    const quads = await rdfDataset(item.document, options)
    const term = value => value.termType === 'Literal'
      ? ['Literal', value.value, value.language ? null : referenceDatatype(quads, value), value.language ?? '']
      : [value.termType, value.value]
    assert.deepEqual(quads.map(q => [term(q.subject), term(q.predicate), term(q.object)]).sort(order), expected.rdf.triples)
  }
  const standard = async () => {
    if (expected.standard.exception) return assert.rejects(jsonld.expand(item.document, jsonldOptions(options)), error =>
      (error.details?.code ?? null) === expected.standard.exception.code)
    assert.deepEqual(await jsonld.expand(item.document, jsonldOptions(options)), expected.standard.expanded)
  }
  await rdf(); await standard(); await standard(); await rdf()
  await Promise.all([rdf(), standard()])
  assert.deepEqual(item, original)
})
