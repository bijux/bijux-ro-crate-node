import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {parseMetadata} from '../../../src/metadata/json/parse.js'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'
import {referenceDatatype} from '../../../src/metadata/rdf/literals/datatype-aliases.js'

const capture = JSON.parse(await readFile(new URL('../../../../../tests/parity/expected/json-number-terms.json', import.meta.url)))
const reference = JSON.parse(await readFile(new URL('../../../../../docs/compatibility/reference.json', import.meta.url)))
assert.equal(capture.reference, reference.commit)
for (const item of capture.cases) {
  test(item.name + ' preserves native RDF lexical identity', async () => {
    const run = () => rdfDataset(parseMetadata(item.source))
    if (item.expected.error) {await assert.rejects(run); return}
    const dataset = await run()
    const terms = dataset.map(q => [q.subject.value, q.predicate.value, q.object.termType,
      q.object.value, q.object.termType === 'Literal' ? referenceDatatype(dataset, q.object) : '', q.object.language ?? '']).sort()
    assert.deepEqual(terms.map(term => JSON.stringify(term)).sort(), item.expected.terms.map(term => JSON.stringify(term)).sort())
  })
}
