import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'
import {jsonld, jsonldOptions} from '../../../src/metadata/jsonld.js'
import type {RDFTerm} from 'jsonld'
const folder = new URL('../../../../../tests/reference/language-indexed-containers/', import.meta.url)
const bytes = await readFile(new URL('documents.json', folder))
const {cases}: {cases: {name: string; document: unknown; error?: unknown}[]} = JSON.parse(bytes.toString('utf8'))
const expected: {inputs_sha256: string; cases: {name: string; error_type?: string; error_code?: string; triples: unknown}[]} = JSON.parse(await readFile(new URL('graphs.json', folder), 'utf8'))
assert.equal(expected.inputs_sha256, createHash('sha256').update(bytes).digest('hex'))
assert.equal(cases.length, 16)
assert.equal(new Set(cases.map(item => item.name)).size, 16)
assert.deepEqual(expected.cases.map(item => item.name), cases.map(item => item.name))
const term = (value: RDFTerm) => value.termType === 'Literal'
  ? [value.termType, value.value, value.datatype.value, value.language ?? ''] : [value.termType, value.value]
for (const [index,item] of cases.entries()) test(item.name + ' retains language-map value ownership', async () => {
  const before = JSON.stringify(item)
  if (item.error) {
    await assert.rejects(jsonld.expand(item.document, jsonldOptions({})), error =>
      (error as {name: string; details: {code: string}}).name === expected.cases[index].error_type && (error as {details: {code: string}}).details.code === expected.cases[index].error_code)
    await assert.rejects(rdfDataset(item.document))
  } else {
    const graph = (await rdfDataset(item.document)).map(quad => {
      assert.equal(quad.graph.termType, 'DefaultGraph')
      return [term(quad.subject), term(quad.predicate), term(quad.object)]
    }).sort((a,b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)
    assert.deepEqual(graph, expected.cases[index].triples)
  }
  assert.equal(JSON.stringify(item), before)
})
