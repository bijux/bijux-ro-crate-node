import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createNamespaceFormatter} from '../../../src/metadata/rdf/namespaces/format.js'
import {rootNamespaceFormatter} from '../../../src/metadata/rdf/namespaces/context.js'
import {parseMetadata} from '../../../src/metadata/json/parse.js'

const root = new URL('../../../../../', import.meta.url)
const input = await readFile(new URL('tests/parity/namespaces/inputs.json', root))
const specification = JSON.parse(input)
const cases = specification.cases
const expected = JSON.parse(await readFile(new URL('tests/parity/expected/rdf-namespaces.json', root)))
assert.equal(createHash('sha256').update(input).digest('hex'), expected.input_sha256)
assert.equal(cases.length, expected.cases.length)
for (const [index, item] of cases.entries()) {
  test('RDFLib namespace labels: ' + item.name, async () => {
    const wanted = expected.cases[index]
    assert.equal(wanted.name, item.name)
    const formatter = item.document
      ? await rootNamespaceFormatter(parseMetadata(item.document))
      : createNamespaceFormatter(item.bindings, {ontologyDefaults: item.ontology_defaults ?? false})
    assert.deepEqual(specification.uri_sets[item.uri_set].map(uri => formatter.format(uri)), wanted.labels)
    assert.equal(formatter.bindings().length, wanted.bindings_count)
    assert.equal(createHash('sha256').update(JSON.stringify(formatter.bindings())).digest('hex'), wanted.bindings_sha256)
  })
}
