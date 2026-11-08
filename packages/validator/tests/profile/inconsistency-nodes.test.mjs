import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import rdf from 'rdf-validate-shacl/src/defaultEnv.js'
import {validateCrate} from '../../src/index.js'
import {parseMetadata} from '../../src/metadata/json/parse.js'
import {rdfDataset} from '../../src/metadata/rdf/dataset.js'
import {copyNumericValue, referenceCardinalityValue} from '../../src/metadata/rdf/literals/numeric-values.js'
import {localLoader} from '../../src/profile/loader.js'
import {materializeProfile} from '../../src/profile/inference/closure.js'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import {normalizeText} from '../../../../tests/parity/normalize.mjs'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'

const cases = (await Promise.all(['profile-inconsistency-nodes', 'profile-datatype-boundaries'].map(async name =>
  JSON.parse(await readFile(new URL('../../../../tests/parity/inputs/' + name + '.json', import.meta.url))).cases))).flat()
const oracle = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/crates.json', import.meta.url)))
for (const item of cases) test(item.name + ' retains OWL error graph facts through SHACL', async () => {
  const expected = oracle.cases.find(c => c.name === item.name)
  assertInputBytes(item, expected)
  compareResult(await validateCrate(new Map(Object.entries(item.files))), expected, item.name)
  const options = {baseURL: 'file:///crate/ro-crate-metadata.json', documentLoader: localLoader()}
  const quads = await rdfDataset(parseMetadata(item.files['ro-crate-metadata.json']), options, 'file:///crate/')
  const inputQuads = quads.filter(q => q.graph.termType === 'DefaultGraph').map(q =>
    rdf.quad(rdf.fromTerm(q.subject), rdf.fromTerm(q.predicate), copyNumericValue(quads, q, rdf.fromTerm(q.object))))
  const inference = materializeProfile(rdf.dataset(inputQuads), rdf, {inputQuads,
    literalValue: term => referenceCardinalityValue(quads, term)})
  const actual = inference.errors.map(receipt => ({node: receipt.node,
    message: normalizeText(receipt.message, '/crate', 'file:///crate')}))
  const wanted = (expected.generated_error_nodes ?? []).map(receipt => ({node: receipt.comparison_node, message: receipt.message}))
  assert.deepEqual(actual, wanted)
})
