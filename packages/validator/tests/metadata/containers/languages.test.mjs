import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {jsonld, jsonldOptions, rdfOptions} from '../../../src/metadata/jsonld.js'

const expected = JSON.parse(await readFile(new URL('../../../../../tests/reference/jsonld-processing/languages.json', import.meta.url)))
assert.equal(expected.cases.length, 325)
assert.equal(new Set(expected.cases.map(item => item.language)).size, expected.cases.length)
assert.equal(expected.grammar_sha256, createHash('sha256').update(await readFile(new URL('../../../../../tests/reference/jsonld-processing/language.py', import.meta.url))).digest('hex'))
test('Object-to-RDF retains exactly the RFC 5646 well-formed tag grammar', async () => {
  for (const item of expected.cases) for (const options of [jsonldOptions({}), rdfOptions({})]) {
    // Object-to-RDF consumes expanded data; earlier expansion may normalize tags.
    const document = [{'@id': 'urn:a', 'urn:p': [{'@value': 'text', '@language': item.language}]}]
    const graph = await jsonld.toRDF(document, {...options, skipExpansion: true})
    assert.equal(graph.length, item.well_formed ? 1 : 0, JSON.stringify(item.language))
    if (item.well_formed) {
      assert.equal(graph[0].object.language, item.language)
      assert.equal(graph[0].object.value, 'text')
    }
  }
})
