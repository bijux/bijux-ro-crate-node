import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'
import {validateCrate} from '../../../src/index.js'
import {cases, assertResult} from '../../../../../tests/reference/jsonld-processing/checks.mjs'

const folder = new URL('../../../../../tests/reference/jsonld-processing/', import.meta.url)
const bytes = await readFile(new URL('documents.json', folder)), documents = JSON.parse(bytes).cases
const expected = JSON.parse(await readFile(new URL('direct.json', folder)))
assert.equal(expected.inputs_sha256, createHash('sha256').update(bytes).digest('hex'))
assert.equal(documents.length, 72)
assert.deepEqual(expected.cases.map(item => item.name), documents.map(item => item.name))
const term = item => item.termType === 'Literal'
  ? [item.termType, item.value, item.datatype.value, item.language ?? ''] : [item.termType, item.value]
for (const [index, item] of documents.entries()) test(item.name + ' retains the bounded primitive contract', async () => {
  const before = structuredClone(item.document), wanted = expected.cases[index]
  if (wanted.error) await assert.rejects(rdfDataset(item.document), error =>
    error.name === wanted.error.type && error.details?.code === wanted.error.code)
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
