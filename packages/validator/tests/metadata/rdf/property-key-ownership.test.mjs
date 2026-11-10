import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import nodeMap from 'jsonld/lib/nodeMap.js'
import util from 'jsonld/lib/util.js'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'
import {jsonld, jsonldOptions} from '../../../src/metadata/jsonld.js'
import {validateCrate} from '../../../src/index.js'
import {compareResult} from '../../../../../tests/parity/compare.mjs'
import {assertInputBytes} from '../../../../../tests/parity/inputs.mjs'

const root = new URL('../../../../../', import.meta.url)
const triples = dataset => dataset.map(quad => [quad.subject.value, quad.predicate.value, quad.object.value])
const options = {baseURL: 'https://example.org/metadata.json'}

for (const [name, value, expected] of [
  ['literal', 'ordinary value', [['urn:root', '__proto__', 'ordinary value']]],
  ['reference', {'@id': 'urn:child'}, [['urn:root', '__proto__', 'urn:child']]],
  ['repeated values', ['first', 'second', 'first'], [['urn:root', '__proto__', 'first'], ['urn:root', '__proto__', 'second']]],
  ['empty values', [], []],
]) test('RDF prototype-named predicate retains ' + name, async () => {
  const document = {'@context': {probe: '__proto__'}, '@id': 'urn:root', probe: value}
  const before = structuredClone(document)
  const prototype = Object.getOwnPropertyDescriptors(Object.prototype)
  assert.deepEqual(triples(await rdfDataset(document, options)), expected)
  assert.deepEqual(document, before)
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), prototype)
})

for (const [name, document, expected] of [
  ['reverse', {'@context': {probe: {'@reverse': '__proto__'}}, '@id': 'urn:root', probe: {'@id': 'urn:child'}},
    [['urn:child', '__proto__', 'urn:root']]],
  ['property scope', {'@context': {extra: {'@id': 'urn:extra', '@context': {probe: '__proto__'}}},
    '@id': 'urn:root', extra: {'@id': 'urn:child', probe: 'ordinary value'}},
    [['urn:root', 'urn:extra', 'urn:child'], ['urn:child', '__proto__', 'ordinary value']]],
  ['node scope', {'@context': {extra: 'urn:extra'}, '@id': 'urn:root',
    extra: {'@id': 'urn:child', '@context': {probe: '__proto__'}, probe: 'ordinary value'}},
    [['urn:root', 'urn:extra', 'urn:child'], ['urn:child', '__proto__', 'ordinary value']]],
]) test('RDF prototype-named predicate retains its ' + name, async () => {
  const before = structuredClone(document)
  const actual = triples(await rdfDataset(document, options))
  assert.deepEqual(actual.sort(), expected.sort())
  assert.deepEqual(document, before)
})

test('ordinary prototype-like source terms retain standard expansion and RDF values', async () => {
  const document = JSON.parse('{"@context":{"__proto__":"urn:prototype","constructor":"urn:constructor","hasOwnProperty":"urn:ownership"},"@id":"urn:root","__proto__":"first","constructor":"second","hasOwnProperty":"third"}')
  const before = structuredClone(document)
  assert.deepEqual(await jsonld.expand(document, jsonldOptions(options)), [{
    '@id': 'urn:root', 'urn:prototype': [{'@value': 'first'}],
    'urn:constructor': [{'@value': 'second'}], 'urn:ownership': [{'@value': 'third'}],
  }])
  assert.deepEqual(triples(await rdfDataset(document, options)).sort(), [
    ['urn:root', 'urn:prototype', 'first'], ['urn:root', 'urn:constructor', 'second'],
    ['urn:root', 'urn:ownership', 'third'],
  ].sort())
  assert.deepEqual(document, before)
})

test('standard metadata expansion still rejects relative prototype predicate mappings', async () => {
  await assert.rejects(jsonld.expand({'@context': {probe: '__proto__'}, '@id': 'urn:root', probe: 'ordinary value'}, jsonldOptions(options)),
    error => error.details?.code === 'invalid IRI mapping')
})

for (const [name, value, settings, expected] of [
  ['single value', {'@id': 'urn:child'}, {}, {'@id': 'urn:child'}],
  ['array value', [{'@id': 'urn:child'}], {valueIsArray: true}, [{'@id': 'urn:child'}]],
  ['empty set', [], {propertyIsArray: true}, []],
  ['index values', ['label'], {propertyIsArray: true, prependValue: true}, ['label']],
]) test('JSON-LD data property ownership preserves ' + name + ' without changing prototypes', () => {
  const target = {}, prototype = Object.getPrototypeOf(target)
  util.addValue(target, '__proto__', value, settings)
  assert.equal(Object.getPrototypeOf(target), prototype)
  assert.equal(Object.hasOwn(target, '__proto__'), true)
  assert.deepEqual(target.__proto__, expected)
  assert.deepEqual(Object.keys(target), ['__proto__'])
  assert.deepEqual(JSON.parse(JSON.stringify(target)).__proto__, expected)
})

test('repeated prototype values preserve equality without changing prototypes', () => {
  const target = {}
  util.addValue(target, '__proto__', 'first', {propertyIsArray: true})
  util.addValue(target, '__proto__', 'second', {propertyIsArray: true})
  util.addValue(target, '__proto__', 'first', {propertyIsArray: true, allowDuplicate: false})
  assert.deepEqual(target.__proto__, ['first', 'second'])
  assert.equal(Object.getPrototypeOf(target), Object.prototype)
})

for (const name of ['__proto__', 'constructor']) for (const mode of ['context', 'term'])
  test('protected ' + name + ' ' + mode + ' mapping survives cloning and refuses nullification', async () => {
    const protectedContext = mode === 'context'
      ? JSON.parse('{"@protected":true,"' + name + '":"urn:probe"}')
      : JSON.parse('{"' + name + '":{"@id":"urn:probe","@protected":true}}')
    await assert.rejects(jsonld.expand({'@context': [protectedContext, {other: 'urn:other'}, null],
      '@id': 'urn:root', 'urn:p': 'value'}, jsonldOptions(options)),
    error => error.details?.code === 'invalid context nullification')
    assert.deepEqual(await jsonld.expand({'@context': [protectedContext, {other: 'urn:other'}],
      '@id': 'urn:root', [name]: 'value'}, jsonldOptions(options)),
    [{'@id': 'urn:root', 'urn:probe': [{'@value': 'value'}]}])
  })

test('subject and graph map merges keep inherited names as owned identities', () => {
  const before = Object.getOwnPropertyDescriptors(Object.prototype)
  for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    const nodes = nodeMap.createMergedNodeMap([{'@id': name, 'urn:p': [{'@value': 'value'}]}])
    assert.equal(Object.hasOwn(nodes, name), true)
    assert.deepEqual(nodes[name], {'@id': name, 'urn:p': [{'@value': 'value'}]})
    const merged = nodeMap.mergeNodeMapGraphs({'@default': nodes})
    assert.equal(Object.hasOwn(merged, name), true)
    assert.deepEqual(merged[name], nodes[name])
    const graphs = {'@default': {}}
    Object.defineProperty(graphs, name, {value: nodes, enumerable: true})
    const flattened = nodeMap.mergeNodeMaps(graphs)
    assert.equal(Object.hasOwn(flattened, name), true)
    assert.deepEqual(flattened[name]['@graph'], [nodes[name]])
  }
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), before)
})

test('hostile relative subject and graph identities cannot contaminate later validation', () => {
  // Isolate the regression so a failing dependency cannot poison this test process.
  const source = new URL('../../../src/metadata/rdf/dataset.js', import.meta.url).href
  const entry = new URL('../../../src/index.js', import.meta.url).href
  const fixture = new URL('tests/parity/fixtures/test_minimal_valid_ro_crate/', root).href
  const code = `
    import assert from 'node:assert/strict';
    import {readFile} from 'node:fs/promises';
    import {rdfDataset} from ${JSON.stringify(source)};
    import {validateCrate} from ${JSON.stringify(entry)};
    const files = new Map(await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name =>
      [name, await readFile(new URL(name, ${JSON.stringify(fixture)}), 'utf8')])));
    const baseline = await validateCrate(files);
    assert.equal(baseline.status, 'valid');
    const builtins = [Object, Object.prototype, Object.prototype.toString, Object.prototype.hasOwnProperty];
    const before = builtins.map(value => Object.getOwnPropertyDescriptors(value));
    for(const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) for(const graph of [false, true]) {
      const document = {'@context': {'@base': null, p: 'urn:p'}, '@id': name,
        ...(graph ? {'@graph': [{'@id': 'urn:child', p: 'ordinary value'}]} : {p: 'ordinary value'})};
      assert.deepEqual(await rdfDataset(document), []);
      assert.deepEqual(builtins.map(value => Object.getOwnPropertyDescriptors(value)), before);
      assert.deepEqual(await validateCrate(files), baseline);
    }
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {encoding: 'utf8', timeout: 30000})
  assert.equal(result.status, 0, result.stderr || result.error?.message)
})

const {cases} = JSON.parse(await readFile(new URL('tests/parity/inputs/property-key-ownership.json', root)))
const reference = JSON.parse(await readFile(new URL('tests/parity/expected/crates.json', root)))
const expected = new Map(reference.cases.map(item => [item.name, item]))
for (const item of cases) test(item.name + ' retains the complete unchanged Python report', async () => {
  const wanted = expected.get(item.name)
  assertInputBytes(item, wanted)
  compareResult(await validateCrate(new Map(Object.entries(item.files))), wanted, item.name)
})
