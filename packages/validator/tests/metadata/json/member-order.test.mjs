import assert from 'node:assert/strict'
import test from 'node:test'
import {parseMetadata} from '../../../src/metadata/json/parse.js'
import {isFloatAt} from '../../../src/metadata/json/number-kinds.js'
import {parseJSONWithOrder, sourceKeys} from '../../../src/metadata/json/ordered-members.js'
import {contextDocument} from '../../../src/metadata/jsonld.js'

test('numeric-looking and escaped duplicate keys retain first-insertion order', () => {
  const source = String.raw`{"2":0,"1":1,"\u0032":2,"01":3,"4294967295":4,"4294967294":5}`
  const result = parseJSONWithOrder(source)
  assert.deepEqual(result, JSON.parse(source))
  assert.deepEqual(sourceKeys(result), ['2', '1', '01', '4294967295', '4294967294'])
  assert.deepEqual(Object.keys(result), ['1', '2', '4294967294', '01', '4294967295'])
  assert.ok(Object.isFrozen(sourceKeys(result)))
})

test('the final duplicate value owns nested order without moving its parent key', () => {
  const result = parseJSONWithOrder('{"2":{"3":0,"1":1},"1":0,"2":{"1":2,"3":3}}')
  assert.deepEqual(sourceKeys(result), ['2', '1'])
  assert.deepEqual(sourceKeys(result['2']), ['1', '3'])
  assert.deepEqual(result['2'], {'1': 2, '3': 3})
})

test('nested arrays, escaped quotes and structural text remain ordinary data', () => {
  const source = String.raw`{"outer":[{"2":"} ] \\\" ","1":"end"},null,true,12]}`
  const result = parseJSONWithOrder(source)
  assert.deepEqual(result, JSON.parse(source))
  assert.deepEqual(sourceKeys(result.outer[0]), ['2', '1'])
})

test('member provenance preserves native numeric kinds and non-finite markers', () => {
  const result = parseMetadata(String.raw`{"2":{"1":1.0,"0":-0.0},"1":NaN,"tag":"\u0075rn:bijux:json-number:NaN","big":9007199254740993}`)
  assert.deepEqual(sourceKeys(result), ['2', '1', 'tag', 'big'])
  assert.deepEqual(sourceKeys(result['2']), ['1', '0'])
  assert.ok(isFloatAt(result['2'], '1'))
  assert.ok(isFloatAt(result['2'], '0'))
  assert.ok(Object.is(result['2']['0'], -0))
  assert.ok(Number.isNaN(result['1']))
  assert.equal(result.tag, 'urn:bijux:json-number:NaN')
  assert.equal(result.big, 9007199254740993n)
})

test('serialized contexts retain source order and caller objects keep native order', () => {
  const parsed = contextDocument('{"@context":{"2":"https://example.org/","1":"https://example.org/"}}')
  assert.deepEqual(sourceKeys(parsed['@context']), ['2', '1'])
  const ordinary = {'2': 'two', '1': 'one'}
  assert.equal(contextDocument(ordinary), ordinary)
  assert.deepEqual(sourceKeys(ordinary), Object.keys(ordinary))
})

test('prototype-like keys remain own data and obsolete duplicate children are ignored', () => {
  const source = '{"x":{"2":1},"__proto__":{"2":0,"1":1},"x":null,"constructor":"value"}'
  const parsed = parseJSONWithOrder(source)
  assert.deepEqual(parsed, JSON.parse(source))
  assert.deepEqual(sourceKeys(parsed), ['x', '__proto__', 'constructor'])
  assert.deepEqual(sourceKeys(parsed.__proto__), ['2', '1'])
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype)
})

test('serialized context parsing adds no nesting limit or relaxed JSON grammar', () => {
  const source = '['.repeat(20000) + '{"2":0,"1":1}' + ']'.repeat(20000)
  let value = contextDocument(source)
  for (let index = 0; index < 20000; index++) value = value[0]
  assert.deepEqual(sourceKeys(value), ['2', '1'])
  for (const invalid of ['{"x":1,}', '{"x":"unterminated}', '[1,]', 'NaN'])
    assert.throws(() => parseJSONWithOrder(invalid), SyntaxError)
})
