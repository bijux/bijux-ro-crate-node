import test from 'node:test'
import assert from 'node:assert/strict'
import parser from 'whatwg-url/lib/url-state-machine.js'
import {parseURLComponents} from '../../src/metadata/models/urls/parser.js'
import {parseURL} from '../../src/metadata/models/urls.js'

// Pinned Pydantic normalization retains every code point and delimiter in userinfo.
for (const [input, expected] of [
  ['http://🙂-@a/', 'http://%F0%9F%99%82-@a/'],
  ['http://-🙂@a/', 'http://-%F0%9F%99%82@a/'],
  ['http://🙂🙂-@a/', 'http://%F0%9F%99%82%F0%9F%99%82-@a/'],
  ['http://u🙂:p-@a/', 'http://u%F0%9F%99%82:p-@a/'],
  ['http://u:p🙂-@a/', 'http://u:p%F0%9F%99%82-@a/'],
  ['http://🙂:🙃-@a/', 'http://%F0%9F%99%82:%F0%9F%99%83-@a/'],
  ['http://🙂-@@a/', 'http://%F0%9F%99%82-%40@a/'],
  ['ftp://𝕒-:𐀀-@example.org/', 'ftp://%F0%9D%95%92-:%F0%90%80%80-@example.org/'],
  ['foo://🙂-@a/', 'foo://%F0%9F%99%82-@a/'],
  ['http://%F0%9F%99%82-@a/', 'http://%F0%9F%99%82-@a/'],
  ['http://ü-@a/', 'http://%C3%BC-@a/'],
  ['http://u::p@a/', 'http://u:%3Ap@a/'],
]) {
  test('userinfo normalization preserves ' + input, () => {
    assert.equal(parseURLComponents(input).href, expected)
    assert.equal(parser.serializeURL(parser.basicURLParse(input)), expected)
    const errors = []
    assert.equal(parseURL(input, ['website'], errors), expected)
    assert.deepEqual(errors, [])
  })
}

// The compatibility option belongs to metadata validation, not the dependency's
// ordinary URL parser. Alternating calls must not change its default behavior.
for (const [input, ordinary, reference] of [
  ['file:host/c:/../a', 'file:///host/a', 'file:///host/c:/a'],
  ['file:///C|/x', 'file:///C:/x', 'file:///C|/x'],
  ['file:////host/x', 'file:////host/x', 'file:///host/x'],
  ['file://host/C:/x', 'file://host/C:/x', 'file:///C:/x'],
]) {
  test('file compatibility is opt-in for ' + input, () => {
    const standard = () => parser.serializeURL(parser.basicURLParse(input))
    assert.equal(standard(), ordinary)
    assert.equal(parseURLComponents(input).href, reference)
    assert.equal(standard(), ordinary)
  })
}

test('file compatibility preserves ordinary URL parsing and parse failure', () => {
  const input = 'https://example.org/a/../b?q=\\x#\\y'
  assert.equal(parseURLComponents(input).href,
    parser.serializeURL(parser.basicURLParse(input)))
  assert.throws(() => parseURLComponents('http://[bad]/'), TypeError)
})

test('long file slash runs retain one local root', () => {
  assert.equal(parseURLComponents('file:' + '/'.repeat(32768) + 'tail').href,
    'file:///tail')
})

test('long first file segments retain their bytes', () => {
  const segment = 'a'.repeat(32768)
  assert.equal(parseURLComponents('file:' + segment).href, 'file:///' + segment)
})
