import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import type {RDFTerm} from 'jsonld'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'
import {validateCrate} from '../../../src/index.js'
import {cases, assertResult} from '../../../../../tests/reference/jsonld-processing/checks.mjs'

const folder = new URL('../../../../../tests/reference/jsonld-processing/', import.meta.url)
type DocumentCase = {name: string; document: unknown}
type DirectCase = {name: string; error?: {type: string; code: string}; triples?: string[][][]}
const bytes = await readFile(new URL('documents.json', folder)), documents: DocumentCase[] = JSON.parse(bytes.toString('utf8')).cases
const expected: {inputs_sha256: string; cases: DirectCase[]} = JSON.parse(await readFile(new URL('direct.json', folder), 'utf8'))
assert.equal(expected.inputs_sha256, createHash('sha256').update(bytes).digest('hex'))
assert.equal(documents.length, 72)
assert.deepEqual(expected.cases.map(item => item.name), documents.map(item => item.name))
const term = (item: RDFTerm) => item.termType === 'Literal'
  ? [item.termType, item.value, item.datatype.value, item.language ?? ''] : [item.termType, item.value]
for (const [index, item] of documents.entries()) test(item.name + ' retains the bounded primitive contract', async () => {
  const before = structuredClone(item.document), wanted = expected.cases[index]
  if (wanted.error) {
    const expectedError = wanted.error
    await assert.rejects(rdfDataset(item.document), error => {
      const actual = error as {name?: string; details?: {code?: string}}
      return actual.name === expectedError.type && actual.details?.code === expectedError.code
    })
  }
  else {
    const triples = (await rdfDataset(item.document)).filter(quad => quad.graph.termType === 'DefaultGraph')
      .map(quad => [term(quad.subject), term(quad.predicate), term(quad.object)])
      .sort((a,b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)
    assert.deepEqual(triples, wanted.triples)
  }
  assert.deepEqual(item.document, before)
})
for (const item of cases) test(item.name + ' retains complete processing and exact input ownership', async () => {
  assertResult(item, await validateCrate(new Map(Object.entries(item.files)),
    {contexts: new Map(Object.entries(item.contexts ?? {}))}))
})
