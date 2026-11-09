import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'
import {jsonld, jsonldOptions} from '../../../src/metadata/jsonld.js'
const root = new URL('../../../../../', import.meta.url)
const input = await readFile(new URL('tests/parity/contexts/type-index-scopes.json', root))
const {cases} = JSON.parse(input)
const reference = JSON.parse(await readFile(new URL('tests/parity/expected/type-index-scopes.json', root)))
assert.equal(reference.inputs_sha256, createHash('sha256').update(input).digest('hex'))
assert.equal(new Set(cases.map(item => item.name)).size, cases.length)
assert.equal(reference.cases.length, cases.length)
const term = value => value.termType === 'Literal'
  ? ['Literal', value.value, value.datatype.value === 'http://www.w3.org/2001/XMLSchema#string' ? null : value.datatype.value, value.language ?? '']
  : [value.termType, value.value]
const sorted = rows => rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'))
for (const [index, item] of cases.entries()) test(item.name + ' retains indexed-node scope without leaking it', async () => {
  const before = structuredClone(item.document), expected = reference.cases[index]
  assert.equal(expected.name, item.name)
  const triples = (await rdfDataset(item.document, {baseURL: item.base})).map(q => [term(q.subject), term(q.predicate), term(q.object)])
  // RDF 1.1 plain strings and xsd:string have the same term identity.
  // The local @none control retains the outer map label, proved by identical
  // PyLD expansion and an unchanged-RDFLib unscoped-IRI counterpart.
  const counterpart = item.rdf_equivalent_to && reference.cases.find(row => row.name === item.rdf_equivalent_to)
  if (counterpart) assert.deepEqual(expected.standard_expanded, counterpart.standard_expanded)
  const wanted = (counterpart || expected).triples.map(row => row.map(t => t[0] === 'Literal' && t[2] === 'http://www.w3.org/2001/XMLSchema#string' ? [t[0],t[1],null,t[3]] : t))
  assert.deepEqual(sorted(triples), sorted(wanted))
  if (item.standard_control) assert.deepEqual(await jsonld.expand(item.document, jsonldOptions({baseURL: item.base})), expected.standard_expanded)
  assert.deepEqual(item.document, before)
})
