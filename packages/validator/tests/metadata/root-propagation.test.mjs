import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createDocumentLoader} from '@bijux/ro-crate-core'
import {validateCrate} from '../../src/index.js'
import {rdfDataset} from '../../src/metadata/rdf/dataset.js'
import {cases, expected, python, approvedDifferences, assertRootPropagationResult} from '../../../../tests/reference/root-context-propagation/checks.mjs'
const graphs = JSON.parse(await readFile(new URL('../../../../tests/reference/root-context-propagation/graphs.json', import.meta.url)))
const context = JSON.parse(await readFile(new URL('../../../../tests/parity/context.json', import.meta.url)))
const term = value => value.termType === 'Literal' ? ['Literal', value.value, value.datatype.value, value.language ?? ''] : [value.termType, value.value]
for (const item of cases) test('complete root context: ' + item.name, async () => {
  const before = JSON.stringify(item)
  const resources = new Map(Object.entries(item.contexts ?? {}))
  for (const name of ['https://w3id.org/ro/crate/1.1/context', 'https://w3id.org/ro/crate/1.1/context.jsonld']) resources.set(name, context)
  const quads = await rdfDataset(JSON.parse(item.files['ro-crate-metadata.json']), {documentLoader: createDocumentLoader(resources)})
  const triples = quads.map(q => [term(q.subject), term(q.predicate), term(q.object)])
    .sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)
  assert.deepEqual(triples, graphs.reference_graphs[graphs.crate_graphs.find(row => row.name === item.name).counterpart])
  assertRootPropagationResult(item, await validateCrate(new Map(Object.entries(item.files)),
    {contexts: new Map(Object.entries(item.contexts ?? {}))}))
  assert.equal(JSON.stringify(item), before)
})

test('root correction contracts cannot accept copied crashes or changed required findings', () => {
  for (const item of cases.filter(item => approvedDifferences.has(item.name)))
    assert.throws(() => assertRootPropagationResult(item, python.get(item.name)))
  const item = cases.find(item => item.name === 'root-context/appended-nonpropagating-missing-name')
  for (const mutate of [report => report.issues.ERROR.pop(), report => {report.issues.ERROR[0].severity = 30},
    report => {report.issues.ERROR[0].message = 'Unrelated rejection'},
    report => {report.issues.ERROR[0].location_description = 'another node'}]) {
    const result = structuredClone(expected.get(item.name)); mutate(result.report)
    assert.throws(() => assertRootPropagationResult(item, result))
  }
})
