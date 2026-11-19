import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createDocumentLoader} from '@bijux/ro-crate-core'
import type {ValidationReport} from '@bijux/ro-crate-core'
import type {RDFTerm} from 'jsonld'
import type {ValidationResult} from '../../src/index.js'
import {validateCrate} from '../../src/index.js'
import {rdfDataset} from '../../src/metadata/rdf/dataset.js'
import {cases, expected, python, approvedDifferences, assertRootPropagationResult} from '../../../../tests/reference/root-context-propagation/checks.mjs'
const graphs: {reference_graphs: Record<string, string[][][]>; crate_graphs: Array<{name: string; counterpart: string}>} = JSON.parse(await readFile(new URL('../../../../tests/reference/root-context-propagation/graphs.json', import.meta.url), 'utf8'))
const context: unknown = JSON.parse(await readFile(new URL('../../../../tests/parity/context.json', import.meta.url), 'utf8'))
const term = (value: RDFTerm) => value.termType === 'Literal' ? ['Literal', value.value, value.datatype.value, value.language ?? ''] : [value.termType, value.value]
for (const item of cases) test('complete root context: ' + item.name, async () => {
  const before = JSON.stringify(item)
  const resources = new Map(Object.entries(item.contexts ?? {}))
  for (const name of ['https://w3id.org/ro/crate/1.1/context', 'https://w3id.org/ro/crate/1.1/context.jsonld']) resources.set(name, context)
  const quads = await rdfDataset(JSON.parse(item.files['ro-crate-metadata.json']), {documentLoader: createDocumentLoader(resources)})
  const triples = quads.map(q => [term(q.subject), term(q.predicate), term(q.object)])
    .sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)
  const graph = graphs.crate_graphs.find(row => row.name === item.name)
  assert.ok(graph, 'Missing reference graph receipt')
  assert.deepEqual(triples, graphs.reference_graphs[graph.counterpart])
  assertRootPropagationResult(item, await validateCrate(new Map(Object.entries(item.files)),
    {contexts: new Map(Object.entries(item.contexts ?? {}))}))
  assert.equal(JSON.stringify(item), before)
})

test('root correction contracts cannot accept copied crashes or changed required findings', () => {
  for (const item of cases.filter(item => approvedDifferences.has(item.name))) {
    const original = python.get(item.name)
    assert.ok(original, 'Missing original Python receipt')
    assert.throws(() => assertRootPropagationResult(item, original as ValidationResult))
  }
  const item = cases.find(item => item.name === 'root-context/appended-nonpropagating-missing-name')
  assert.ok(item)
  for (const mutate of [(report: ValidationReport) => report.issues.ERROR.pop(), (report: ValidationReport) => {report.issues.ERROR[0].severity = 30},
    (report: ValidationReport) => {report.issues.ERROR[0].message = 'Unrelated rejection'},
    (report: ValidationReport) => {report.issues.ERROR[0].location_description = 'another node'}]) {
    const wanted = expected.get(item.name)
    assert.ok(wanted)
    const result = structuredClone(wanted) as ValidationResult; mutate(result.report)
    assert.throws(() => assertRootPropagationResult(item, result))
  }
})
