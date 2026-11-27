import assert from 'node:assert/strict'
import test from 'node:test'
import {parseMetadata} from '../../../src/metadata/json/parse.js'
import {jsonldValue} from '../../../src/metadata/json/jsonld-values.js'
import {rdfDataset} from '../../../src/metadata/rdf/dataset.js'

test('JSON integer precision survives model input and RDF lexical conversion', async () => {
  const value = '1234567890123456789012345678901234567890'
  const document = parseMetadata(`{"@context":{"year":"http://example.org/year"},"@id":"http://example.org/p","year":${value}}`) as {year: bigint}
  assert.equal(document.year, BigInt(value))
  const dataset = await rdfDataset(document)
  const literal = dataset.find(quad => quad.predicate.value === 'http://example.org/year')!.object as {value: string; datatype: {value: string}}
  assert.equal(literal.value, value)
  assert.equal(literal.datatype.value, 'http://www.w3.org/2001/XMLSchema#integer')
  assert.equal((parseMetadata('{"label":"9007199254740993"}') as {label: string}).label, '9007199254740993')
})

test('Python JSON constants retain numeric meaning without rewriting quoted strings', () => {
  const parsed = parseMetadata('{"nan":NaN,"infinity":Infinity,"negative":-Infinity,"text":"NaN Infinity -Infinity","urn:bijux:json-number:NaN":"literal"}') as {nan: number; infinity: number; negative: number; text: string; 'urn:bijux:json-number:NaN': string}
  assert.ok(Number.isNaN(parsed.nan))
  assert.equal(parsed.infinity, Infinity)
  assert.equal(parsed.negative, -Infinity)
  assert.equal(parsed.text, 'NaN Infinity -Infinity')
  assert.equal(parsed['urn:bijux:json-number:NaN'], 'literal')
  assert.deepEqual(parseMetadata('[NaN,"NaN",[Infinity]]'), [NaN, 'NaN', [Infinity]])
})

test('JSON constant compatibility does not admit malformed keys or values', () => {
  for (const text of ['{NaN:1}', '[+Infinity]', '[-NaN]', '[NaNtail]', '[preNaN]', '[NaN:]'])
    assert.throws(() => parseMetadata(text), SyntaxError)
})

for (const constant of ['NaN', 'Infinity', '-Infinity']) {
  for (const prefix of [String.raw`urn:\u0062ijux:json-number:`, String.raw`urn\u003abijux:json-number:`]) {
    test(`escaped marker text remains a string alongside bare ${constant}: ${prefix}`, () => {
      const parsed = parseMetadata(`{"name":"${prefix}${constant}","probe":${constant}}`) as {name: string; probe: number}
      assert.equal(parsed.name, 'urn:bijux:json-number:' + constant)
      if (constant === 'NaN') assert.ok(Number.isNaN(parsed.probe))
      else assert.equal(parsed.probe, constant === 'Infinity' ? Infinity : -Infinity)
    })
  }
}

test('non-finite constants require token sources even without finite numeric values', () => {
  const parse = JSON.parse
  JSON.parse = (text, reviver) => parse(text, function (key, value) {return reviver!.call(this, key, value)})
  try {
    for (const constant of ['NaN', 'Infinity', '-Infinity'])
      assert.throws(() => parseMetadata(`[${constant}]`), /cannot retain JSON numeric token identity/)
    assert.deepEqual(parseMetadata('["NaN","Infinity","-Infinity"]'), ['NaN', 'Infinity', '-Infinity'])
  } finally {JSON.parse = parse}
})

test('numeric kind tracking preserves primitive model inputs and quoted strings', async () => {
  const document = parseMetadata('{"@id":"urn:subject","urn:value":1.0,"array":[1e0,-0.0,-0],"text":"1.0"}') as {'urn:value': number; array: number[]}
  assert.equal(typeof document['urn:value'], 'number')
  assert.equal(document['urn:value'], 1)
  assert.deepEqual(jsonldValue(document), {'@id':'urn:subject', 'urn:value':1, array:[1,-0,0], text:'1.0'})
  assert.equal(Object.is(document.array[1], -0), true)
  assert.equal(Object.is(document.array[2], -0), false)
  const literal = (await rdfDataset(document)).find(q => q.predicate.value === 'urn:value')!.object as {value: string; datatype: {value: string}}
  assert.equal(literal.datatype.value, 'http://www.w3.org/2001/XMLSchema#double')
  assert.equal(literal.value, '1.0')
})

test('missing numeric token-source support refuses validation instead of guessing', () => {
  const parse = JSON.parse
  JSON.parse = (text, reviver) => parse(text, function (key, value) {return reviver!.call(this, key, value)})
  try {
    assert.throws(() => parseMetadata('{"value":1.0}'), /cannot retain JSON numeric token identity/)
  } finally {JSON.parse = parse}
})

test('large JSON strings and escaped constants parse without exhausting the call stack', () => {
  const large = 'x'.repeat(17 * 1024 * 1024)
  const escaped = String.raw`\\\"NaN Infinity -Infinity`.repeat(300000)
  const source = `{"description":${JSON.stringify(large)},"escaped":${JSON.stringify(escaped)},"values":[NaN,Infinity,-Infinity]}`
  const parsed = parseMetadata(source) as {description:string; escaped:string; values:number[]}
  assert.equal(parsed.description, large)
  assert.equal(parsed.escaped, escaped)
  assert.ok(Number.isNaN(parsed.values[0]))
  assert.equal(parsed.values[1], Infinity)
  assert.equal(parsed.values[2], -Infinity)
})


test('malformed JSON with many escaped quotes remains rejected', () => {
  const invalid = '["' + String.raw`\\\"`.repeat(200000) + 'NaN'
  assert.throws(() => parseMetadata(invalid), SyntaxError)
})

test('marker collisions and long hyphen runs require bounded uniqueness checks', () => {
  const prefix = 'urn:bijux:json-number:'
  const ordinary = prefix + '-'.repeat(50000)
  const collision0 = prefix + '~00000000~NaN'
  const collision1 = prefix + '~00000001~Infinity'
  const input = `{"ordinary":${JSON.stringify(ordinary)},"first":${JSON.stringify(collision0)},"second":${JSON.stringify(collision1)},"escaped":"urn:\\u0062ijux:json-number:NaN","escapedCandidate":"urn:\\u0062ijux:json-number:~00000002~NaN","values":[NaN,Infinity,-Infinity]}`
  const original = String.prototype.includes
  let checks = 0
  let parsed: {ordinary:string; first:string; second:string; escaped:string; escapedCandidate:string; values:number[]}
  try {
    String.prototype.includes = function (search:string, position?:number) {if (search.startsWith(prefix)) checks++; return original.call(this, search, position)}
    parsed = parseMetadata(input) as typeof parsed
  } finally {String.prototype.includes = original}
  assert.ok(checks <= 2, `marker lookup repeated ${checks} times`)
  assert.equal(parsed.ordinary, ordinary)
  assert.equal(parsed.first, collision0)
  assert.equal(parsed.second, collision1)
  assert.equal(parsed.escaped, prefix + 'NaN')
  assert.equal(parsed.escapedCandidate, prefix + '~00000002~NaN')
  assert.ok(Number.isNaN(parsed.values[0]))
  assert.equal(parsed.values[1], Infinity)
  assert.equal(parsed.values[2], -Infinity)
})

test('ordinary marker collisions preserve native malformed JSON diagnostics', () => {
  const input = 'NaN}urn:bijux:json-number:'
  const legacy = '"urn:bijux:json-number:-NaN"}urn:bijux:json-number:'
  let expected = ''
  try {JSON.parse(legacy)} catch (error) {if (error instanceof SyntaxError) expected = error.message}
  assert.ok(expected)
  assert.throws(() => parseMetadata(input), error => error instanceof SyntaxError && error.message === expected)
})

test('long marker collisions retain legacy diagnostics when expansion is bounded', () => {
  const prefix = 'urn:bijux:json-number:'
  const hyphens = '-'.repeat(64)
  const input = 'NaN}' + prefix + hyphens
  const legacy = JSON.stringify(prefix + hyphens + '-NaN') + '}' + prefix + hyphens
  let expected = ''
  try {JSON.parse(legacy)} catch (error) {if (error instanceof SyntaxError) expected = error.message}
  assert.ok(expected)
  assert.throws(() => parseMetadata(input), error => error instanceof SyntaxError && error.message === expected)
})

test('many constants cannot force unbounded legacy diagnostic expansion', () => {
  const prefix = 'urn:bijux:json-number:'
  const input = '[' + 'NaN,'.repeat(10000) + ']"' + prefix + '-'.repeat(100000) + '"'
  const original = JSON.parse
  let maximum = 0
  try {
    JSON.parse = function (text:string, reviver?:Parameters<typeof JSON.parse>[1]) {maximum = Math.max(maximum, text.length); return original(text, reviver)}
    assert.throws(() => parseMetadata(input), error => error instanceof SyntaxError && /0000~NaN/.test(error.message))
  } finally {JSON.parse = original}
  assert.ok(maximum <= 4 * input.length, `unexpected diagnostic expansion: ${maximum}`)
})

test('bounded malformed diagnostics retain legacy excerpts and multiline positions', () => {
  const prefix = 'urn:bijux:json-number:'
  const marker = prefix + '-'.repeat(65)
  for (const input of [
    '[NaN,Infinity,-Infinity,]"' + prefix + '-'.repeat(64) + '"',
    '{"a":NaN,\n"b":Infinity "c":-Infinity}"' + prefix + '-'.repeat(64) + '"',
  ]) {
    const legacy = input.replace(/"(?:[^"\\]|\\[\s\S])*"|(-?Infinity|NaN)/g, (token, constant:string | undefined, offset:number, source:string) => {
      if (!constant) return token
      let before = offset - 1, after = offset + token.length
      while (/[ \t\r\n]/.test(source[before] ?? '')) before--
      while (/[ \t\r\n]/.test(source[after] ?? '')) after++
      return (before >= 0 && !/[:\[,]/.test(source[before])) || (after < source.length && !/[,}\]]/.test(source[after])) ? token : JSON.stringify(marker + token)
    })
    let expected = ''
    try {JSON.parse(legacy)} catch (error) {if (error instanceof SyntaxError) expected = error.message}
    assert.ok(expected)
    assert.throws(() => parseMetadata(input), error => error instanceof SyntaxError && error.message === expected)
  }
})
