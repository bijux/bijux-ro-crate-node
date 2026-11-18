import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {createDocumentLoader} from '@bijux/ro-crate-core'
import {validateCrate} from '../../src/index.js'
import {rdfDataset} from '../../src/metadata/rdf/dataset.js'
import type {RDFTerm} from 'jsonld'

interface ContextCase {name: string; document: unknown; contexts: Record<string, unknown>}
interface CaptureCase {name: string; exception?: {message: string}; triples?: unknown}

const input = await readFile(new URL('../../../../tests/parity/jsonld-contexts.json', import.meta.url))
const cases: ContextCase[] = JSON.parse(input.toString('utf8'))
const expected: {reference: string; inputs_sha256: string; cases: CaptureCase[]} = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/jsonld-contexts.json', import.meta.url), 'utf8'))
const reference: {commit: string} = JSON.parse(await readFile(new URL('../../../../docs/compatibility/reference.json', import.meta.url), 'utf8'))
assert.equal(expected.reference, reference.commit)
assert.equal(expected.inputs_sha256, createHash('sha256').update(input).digest('hex'))
const term = (value: RDFTerm) => value.termType === 'Literal' ?
  ['Literal', value.value, value.datatype.value, value.language ?? ''] : ['NamedNode', value.value]
async function compare(item: ContextCase) {
  const before = JSON.stringify(item)
  const options = {documentLoader: createDocumentLoader(new Map(Object.entries(item.contexts)))}
  const wanted = expected.cases.find(row => row.name === item.name)!
  if (wanted.exception) {
    await assert.rejects(rdfDataset(item.document, options), {message: wanted.exception.message}, item.name)
  } else {
    const quads = await rdfDataset(item.document, options)
    const triples = quads.map(q => [term(q.subject), term(q.predicate), term(q.object)])
      .sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)
    assert.deepEqual(triples, wanted.triples, item.name)
  }
  assert.equal(JSON.stringify(item), before, item.name)
}
for (const item of cases) test('RDFLib context parsing: ' + item.name, () => compare(item))
test('concurrent context loaders retain independent imported snapshots', async () => {
  await Promise.all(cases.map(compare))
})


test('serialized remote contexts retain complete public validation behavior', async () => {
  const files = new Map(await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name =>
    [name, await readFile(new URL('../../../../tests/parity/fixtures/test_minimal_valid_ro_crate/' + name, import.meta.url), 'utf8')] as [string, string])))
  const url = 'https://example.org/contexts/propagation'
  const document = JSON.parse(files.get('ro-crate-metadata.json')!)
  document['@context'].push(url)
  files.set('ro-crate-metadata.json', JSON.stringify(document))
  for (const serialized of [false, true]) for (const propagate of [false, true]) {
    const context = {'@context': {'@propagate': propagate}}
    const result = await validateCrate(files, {contexts: new Map([[url, serialized ? JSON.stringify(context) : context]])})
    assert.equal(result.status, 'valid')
    assert.equal(result.report.highest_error_level, null)
    assert.deepEqual(result.report.issues.ERROR, [])
  }
})
