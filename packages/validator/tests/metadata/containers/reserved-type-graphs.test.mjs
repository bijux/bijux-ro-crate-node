import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {jsonld, jsonldOptions, rdfOptions} from '../../../src/metadata/jsonld.js'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'
const folder = new URL('../../../../../tests/reference/reserved-type-identifiers/', import.meta.url)
const bytes = await readFile(new URL('documents.json', folder))
const {cases} = JSON.parse(bytes)
const reference = JSON.parse(await readFile(new URL('graphs.json', folder)))
assert.equal(reference.inputs_sha256, createHash('sha256').update(bytes).digest('hex'))
assert.equal(cases.length, 13)
assert.equal(new Set(cases.map(item => item.name)).size, 13)
assert.deepEqual(reference.cases.map(item => item.name), cases.map(item => item.name))
const term = value => value.termType === 'Literal'
  ? [value.termType, value.value, value.datatype.value, value.language ?? ''] : [value.termType, value.value]
for (const [index, item] of cases.entries()) test(item.name + ' agrees with independently expanded omission counterpart', async () => {
  const before = JSON.stringify(item)
  for (const options of [jsonldOptions({}), rdfOptions({})]) {
    assert.deepEqual(await jsonld.expand(item.document, options), reference.cases[index].counterpart_expanded)
  }
  const graph = (await rdfDataset(item.document)).map(quad => {
    assert.equal(quad.graph.termType, 'DefaultGraph')
    return [term(quad.subject), term(quad.predicate), term(quad.object)]
  }).sort((a,b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)
  assert.deepEqual(graph, reference.cases[index].triples)
  assert.equal(JSON.stringify(item), before)
})
