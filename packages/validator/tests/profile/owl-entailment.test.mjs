import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import rdf from 'rdf-validate-shacl/src/defaultEnv.js'
import {validateCrate} from '../../src/index.js'
import {inferenceDataset, OWL} from '../../src/profile/inference/dataset.js'
import {propertyRules} from '../../src/profile/inference/properties.js'
import {compareResult} from '../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'

const root = new URL('../../../../', import.meta.url)
const cases = JSON.parse(await readFile(new URL('tests/parity/inputs/profile-owl-entailment.json', root))).cases
const expected = new Map(JSON.parse(await readFile(new URL('tests/parity/expected/crates.json', root))).cases.map(c => [c.name, c]))
for (const item of cases) test(item.name + ' retains complete pinned profile findings', async () => {
  const wanted = expected.get(item.name)
  assertInputBytes(item, wanted)
  const actual = await validateCrate(new Map(Object.entries(item.files)),
    {contexts: new Map(Object.entries(item.contexts ?? {}))})
  compareResult(actual, wanted, item.name)
})

test('blank-predicate intermediates consume the same inferred-quad budget', () => {
  const named = value => rdf.namedNode('https://example.test/' + value)
  const graph = rdf.dataset([
    rdf.quad(named('p'), rdf.namedNode(OWL + 'inverseOf'), rdf.blankNode('inverse')),
    rdf.quad(named('a'), named('p'), named('b')),
  ])
  const inference = inferenceDataset(graph, rdf, {maxInferredQuads: 0})
  assert.throws(() => inference.close([propertyRules]), /inferred quad budget/)
  assert.ok([...graph].every(q => q.predicate.termType === 'NamedNode'))
})
