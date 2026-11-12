import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createDocumentLoader} from '@bijux/ro-crate-core'
import {validateCrate} from '../../src/index.js'
import {validateMetadata} from '../../src/metadata/validation.js'
import {rdfDataset} from '../../src/metadata/rdf/dataset.js'
import {cases, assertResult, originalByName} from '../../../../tests/reference/disabled-context-terms/checks.mjs'

const context = JSON.parse(await readFile(new URL('../../../../tests/parity/context.json', import.meta.url)))
const loader = () => createDocumentLoader(new Map([['https://w3id.org/ro/crate/1.1/context', context]]))
const fixtures = new URL('../../../../tests/reference/disabled-context-terms/', import.meta.url)
const graphs = JSON.parse(await readFile(new URL('graphs.json', fixtures)))
assert.equal(graphs.reference, JSON.parse(await readFile(new URL('../../../../docs/compatibility/reference.json', import.meta.url))).commit)
assert.equal(graphs.inputs_sha256, createHash('sha256').update(await readFile(new URL('inputs.json', fixtures))).digest('hex'))
assert.deepEqual(graphs.cases.map(row => row.name), cases.map(item => item.name))
const term = value => value.termType === 'Literal'
  ? ['Literal', value.value, value.datatype.value, value.language ?? ''] : [value.termType, value.value]
for (const item of cases) test(item.name + ' preserves completed validation and disabled-term RDF identity', async () => {
  const document = JSON.parse(item.files['ro-crate-metadata.json'])
  const before = JSON.stringify(document)
  const result = await validateCrate(new Map(Object.entries(item.files)))
  assertResult(item, result)
  const quads = await rdfDataset(document, {documentLoader: loader()})
  const triples = quads.map(q => [term(q.subject), term(q.predicate), term(q.object)])
    .sort((a,b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)
  const digest = graphs.cases.find(row => row.name === item.name).graph_sha256
  assert.equal(createHash('sha256').update(JSON.stringify(graphs.graphs[digest])).digest('hex'), digest)
  assert.deepEqual(triples, graphs.graphs[digest])
  assert.equal(JSON.stringify(document), before)
})

test('a disabled BIA term is rejected before metadata model projection', async () => {
  const original = JSON.parse(await readFile(new URL('original-primitive.json', fixtures)))
  assert.equal(original.expected.exception, undefined)
  assert.deepEqual(original.input['@context'].at(-1), {accessionId: null})
  const issues = []
  const actual = await validateMetadata(original.input, issues, {documentLoader: loader()})
  assert.deepEqual(issues, original.expected.issues)
  assert.equal(actual.entities.size, 0)
  assert.equal(Object.hasOwn(actual.context, 'accessionId'), false)
})

test('disabled-term contracts require completion instead of a parser interruption', () => {
  for (const item of cases) {
    const interrupted = {...originalByName.get(item.name), status: 'incomplete'}
    assert.throws(() => assertResult(item, interrupted))
  }
})
