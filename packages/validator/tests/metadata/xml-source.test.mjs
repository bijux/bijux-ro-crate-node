import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {DOMImplementation} from '@xmldom/xmldom'
import {xmlLiteral} from '../../src/metadata/rdf/literals/markup/xml.js'
import {parseXMLFragment} from '../../src/metadata/rdf/literals/markup/xml-parser.js'
import {assertXMLQualifiedName} from '../../src/metadata/rdf/literals/markup/xml-source.js'

const capture = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/xml-source-identities.json', import.meta.url)))
const bytes = await readFile(new URL('../../../../tests/parity/xml-source/inputs.json', import.meta.url))
const reference = JSON.parse(await readFile(new URL('../../../../docs/compatibility/reference.json', import.meta.url)))
assert.equal(capture.reference, reference.commit)
assert.equal(capture.input_sha256, createHash('sha256').update(bytes).digest('hex'))
assert.deepEqual(capture.values.map(row => row.input), JSON.parse(bytes).values.map(row => row.input))

for (const row of capture.values) test('XML source identity: ' + JSON.stringify(row.input), () => {
  assert.equal(xmlLiteral(row.input), row.canonical)
})

for (const [point, accepted] of [[0x037d, true], [0x037e, false], [0x037f, true], [0x200c, true],
  [0x200d, true], [0x10000, true], [0xeffff, true], [0xf0000, false], [0x10ffff, false]])
  test('XML Fifth Edition name boundary U+' + point.toString(16), () => {
    const name = String.fromCodePoint(point) + 'x'
    if (accepted) assert.doesNotThrow(() => assertXMLQualifiedName(name))
    else assert.throws(() => assertXMLQualifiedName(name), /Invalid XML qualified name/)
  })

test('XML xmlns construction is scoped to the owned parser document', () => {
  const outside = new DOMImplementation().createDocument(null, '')
  const constructor = Object.getPrototypeOf(outside).createElementNS
  const parsed = parseXMLFragment('<xmlns xmlns="urn:example"></xmlns>')
  const node = parsed.documentElement.firstChild
  assert.equal(node.tagName, 'xmlns')
  assert.equal(node.namespaceURI, 'urn:example')
  assert.equal(Object.getPrototypeOf(parsed).createElementNS, constructor)
  assert.equal(outside.createElementNS, constructor)
})
