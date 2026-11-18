import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createDocumentLoader} from '@bijux/ro-crate-core'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'
import {jsonld, jsonldOptions, rdfOptions} from '../../../src/metadata/jsonld.js'
import {referenceCardinalityValue} from '../../../src/metadata/rdf/literals/numeric-values.js'
import type {RDFQuad, RDFTerm} from 'jsonld'

interface GraphCase {name: string; document: unknown; contexts?: Record<string, unknown>}
interface CapturedGraph {name: string; original_exception: unknown; triples: unknown; standard_triples: unknown}
interface Primitive {input: GraphCase; expected: {exception: unknown}}
interface ImportPrimitive {input: GraphCase & {base: string; contexts: Record<string, unknown>}; graph_case: string; expected: {rdf: {exception: {type: string; code: unknown; message: string}}; standard: {expanded: unknown}}}

const fixture = new URL('../../../../../tests/reference/root-context-propagation/', import.meta.url)
const bytes = await readFile(new URL('graphs-input.json', fixture))
const {cases}: {cases: GraphCase[]} = JSON.parse(bytes.toString('utf8'))
const expected: {inputs_sha256: string; cases: CapturedGraph[]; reference: string} = JSON.parse(await readFile(new URL('graphs.json', fixture), 'utf8'))
assert.equal(expected.inputs_sha256, createHash('sha256').update(bytes).digest('hex'))
assert.deepEqual(expected.cases.map(row => row.name), cases.map(row => row.name))
const pin: {commit: string} = JSON.parse(await readFile(new URL('../../../../../docs/compatibility/reference.json', import.meta.url), 'utf8'))
assert.equal(expected.reference, pin.commit)
const original: Primitive = JSON.parse(await readFile(new URL('original-primitive.json', fixture), 'utf8'))
const preserved = cases.find(item => item.name === original.input.name)!
assert.deepEqual({name: preserved.name, document: preserved.document, contexts: preserved.contexts}, original.input)
assert.deepEqual(expected.cases.find(row => row.name === preserved.name)!.original_exception, original.expected.exception)

const term = (value: RDFTerm) => value.termType === 'Literal'
  ? ['Literal', value.value, value.datatype.value, value.language ?? ''] : [value.termType, value.value]

test('imported root correction preserves standard expansion and isolated context caches', async () => {
  const original: ImportPrimitive = JSON.parse(await readFile(new URL('original-import-primitive.json', fixture), 'utf8'))
  const item = original.input, before = structuredClone(item)
  const preserved = cases.find(row => row.name === original.graph_case)!
  assert.deepEqual(preserved.document, item.document)
  assert.deepEqual(preserved.contexts, item.contexts)
  assert.equal(item.base, 'file:///crate/ro-crate-metadata.json')
  assert.deepEqual(original.expected.rdf.exception, {type: 'AttributeError', code: null,
    message: "'NoneType' object has no attribute 'get_id'"})
  const graph = expected.cases.find(row => row.name === original.graph_case)!
  assert.deepEqual(graph.original_exception, {type: original.expected.rdf.exception.type,
    message: original.expected.rdf.exception.message})
  const options = {baseURL: item.base,
    documentLoader: createDocumentLoader(new Map(Object.entries(item.contexts)))}
  assert.notEqual(jsonldOptions(options).contextResolver, rdfOptions(options).contextResolver)
  assert.equal((jsonldOptions(options) as {rdfLibImportKeywords?: boolean}).rdfLibImportKeywords, undefined)
  assert.equal((rdfOptions(options) as {pyldContextKeywords?: boolean}).pyldContextKeywords, undefined)
  const rdf = async () => {
    const quads = await rdfDataset(item.document, options)
    const triples = quads.map(q => [term(q.subject), term(q.predicate), term(q.object)])
      .sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)
    assert.deepEqual(triples, graph.triples)
  }
  const standard = async () => assert.deepEqual(
    await jsonld.expand(item.document, jsonldOptions(options)), original.expected.standard.expanded)
  await rdf(); await standard(); await standard(); await rdf()
  await Promise.all([rdf(), standard()])
  assert.deepEqual(item, before)
})

for (const item of cases) test('root context propagation: ' + item.name, async () => {
  const before = JSON.stringify(item)
  const quads = await rdfDataset(item.document,
    {documentLoader: createDocumentLoader(new Map(Object.entries(item.contexts ?? {})))})
  const triples = quads.map(q => [term(q.subject), term(q.predicate), term(q.object)])
    .sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)
  assert.deepEqual(triples, expected.cases.find(row => row.name === item.name)!.triples)
  if (item.name.startsWith('native-')) {
    const quad = quads.find(quad => quad.predicate.value === 'urn:p')!
    assert.equal(referenceCardinalityValue(quads, quad.object, quad), 1)
  }
  assert.equal(JSON.stringify(item), before)
})

test('nonpropagating root contexts keep the physical-parent refusal', async () => {
  for (const context of [
    [{p: 'urn:p', '@base': '../'}, {'@propagate': false}],
    [{p: {'@id': 'urn:p', '@type': '@id'}}, {'@propagate': false}],
  ] as Record<string, unknown>[][]) {
    const document = {'@context': context, '@id': context[0]['@base'] ? 'item' : 'urn:s',
      p: context[0]['@base'] ? 'value' : '../outside'}
    await assert.rejects(rdfDataset(document), /physical parent directory outside the selected crate/)
  }
  await assert.rejects(rdfDataset({'@context': {'@base': '../', '@propagate': false},
    '@id': 'urn:s', 'urn:p': {'@id': 'item'}}), /physical parent directory outside the selected crate/)
})

for (const item of cases.filter(item => item.name.endsWith('type-scope-reference')))
  test('standard metadata processing keeps its own context semantics: ' + item.name, async () => {
    const options = jsonldOptions({rdfRootPropagation: {pending: true, contexts: new WeakSet()}})
    assert.equal(Object.hasOwn(options, 'rdfRootPropagation'), false)
    const quads = await jsonld.toRDF(item.document, options) as RDFQuad[]
    const triples = quads.map(q => [term(q.subject), term(q.predicate), term(q.object)])
      .sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)
    assert.deepEqual(triples, expected.cases.find(row => row.name === item.name)!.standard_triples)
  })
