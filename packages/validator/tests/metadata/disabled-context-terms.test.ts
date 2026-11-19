import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createDocumentLoader} from '@bijux/ro-crate-core'
import type {ValidationIssue} from '@bijux/ro-crate-core'
import type {RDFTerm} from 'jsonld'
import {validateCrate} from '../../src/index.js'
import {validateMetadata} from '../../src/metadata/validation.js'
import {rdfDataset} from '../../src/metadata/rdf/dataset.js'
import {cases, assertResult, originalByName} from '../../../../tests/reference/disabled-context-terms/checks.mjs'

const context: unknown = JSON.parse(await readFile(new URL('../../../../tests/parity/context.json', import.meta.url), 'utf8'))
const loader = () => createDocumentLoader(new Map([['https://w3id.org/ro/crate/1.1/context', context]]))
const fixtures = new URL('../../../../tests/reference/disabled-context-terms/', import.meta.url)
const graphs: {reference: string; inputs_sha256: string; cases: {name: string; graph_sha256: string}[]; graphs: Record<string, string[][][]>} = JSON.parse(await readFile(new URL('graphs.json', fixtures), 'utf8'))
assert.equal(graphs.reference, JSON.parse(await readFile(new URL('../../../../docs/compatibility/reference.json', import.meta.url), 'utf8')).commit)
assert.equal(graphs.inputs_sha256, createHash('sha256').update(await readFile(new URL('inputs.json', fixtures))).digest('hex'))
assert.deepEqual(graphs.cases.map(row => row.name), cases.map(item => item.name))
const term = (value: RDFTerm) => value.termType === 'Literal'
  ? ['Literal', value.value, value.datatype.value, value.language ?? ''] : [value.termType, value.value]
for (const item of cases) test(item.name + ' preserves completed validation and disabled-term RDF identity', async () => {
  const document = JSON.parse(item.files['ro-crate-metadata.json'])
  const before = JSON.stringify(document)
  const result = await validateCrate(new Map(Object.entries(item.files)))
  assertResult(item, result)
  const quads = await rdfDataset(document, {documentLoader: loader()})
  const triples = quads.map(q => [term(q.subject), term(q.predicate), term(q.object)])
    .sort((a,b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)
  const graphCase = graphs.cases.find(row => row.name === item.name)
  assert.ok(graphCase, 'Missing reference graph receipt')
  const digest = graphCase.graph_sha256
  assert.equal(createHash('sha256').update(JSON.stringify(graphs.graphs[digest])).digest('hex'), digest)
  assert.deepEqual(triples, graphs.graphs[digest])
  assert.equal(JSON.stringify(document), before)
})

test('a disabled BIA term is rejected before metadata model projection', async () => {
  const original = JSON.parse(await readFile(new URL('original-primitive.json', fixtures), 'utf8'))
  assert.equal(original.expected.exception, undefined)
  assert.deepEqual(original.input['@context'].at(-1), {accessionId: null})
  const issues: ValidationIssue[] = []
  const actual = await validateMetadata(original.input, issues, {documentLoader: loader()})
  assert.deepEqual(issues, original.expected.issues)
  assert.equal(actual.entities.size, 0)
  assert.equal(Object.hasOwn(actual.context, 'accessionId'), false)
})

test('disabled-term contracts require completion instead of a parser interruption', () => {
  for (const item of cases) {
    const interrupted = {...originalByName.get(item.name), status: 'incomplete'}
    assert.throws(() => assertResult(item, interrupted as Parameters<typeof assertResult>[1]))
  }
})
