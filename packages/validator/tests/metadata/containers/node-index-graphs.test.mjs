import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'
import {parseMetadata} from '../../../src/metadata/json/parse.js'
const folder = new URL('../../../../../tests/reference/node-indexed-containers/', import.meta.url)
const bytes = await readFile(new URL('documents.json', folder))
const {cases} = parseMetadata(bytes.toString('utf8'))
const expected = JSON.parse(await readFile(new URL('graphs.json', folder)))
assert.equal(expected.inputs_sha256, createHash('sha256').update(bytes).digest('hex'))
assert.deepEqual(expected.cases.map(item => item.name), cases.map(item => item.name))
const term = value => value.termType === 'Literal'
  ? [value.termType, value.value, value.datatype.value, value.language ?? ''] : [value.termType, value.value]
for (const [index, item] of cases.entries()) test(item.name + ' preserves its independent graph and original input', async () => {
  const before = JSON.stringify(item.document)
  const graph = (await rdfDataset(item.document)).filter(quad => quad.graph.termType === 'DefaultGraph')
    .map(quad => [term(quad.subject), term(quad.predicate), term(quad.object)])
  assert.ok(!JSON.stringify(item.document).includes('_:'))
  const anonymous = new Set(graph.flat().filter(value => value[0] === 'BlankNode').map(value => value[1]))
  assert.ok(anonymous.size <= 1)
  assert.equal(anonymous.size, expected.cases[index].anonymous_nodes)
  for (const triple of graph) for (const value of triple) if (value[0] === 'BlankNode') value[1] = 'anonymous'
  graph.sort((a,b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)
  assert.deepEqual(graph, expected.cases[index].triples)
  assert.equal(JSON.stringify(item.document), before)
})
