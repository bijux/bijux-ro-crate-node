import assert from 'node:assert/strict'
import test from 'node:test'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {isRDFNameCharacter, isRDFSplitStartCharacter, isPythonWordCharacter} from '../../../src/metadata/rdf/unicode-names.js'

const expected = JSON.parse(await readFile(new URL('../../../../../tests/parity/expected/unicode-names.json', import.meta.url)))
test('RDF name and Python word predicates match every pinned Unicode codepoint', () => {
  const digest = createHash('sha256')
  for (let code = 0; code < expected.codepoints; code += 1) {
    const character = String.fromCodePoint(code)
    const flags = Number(isRDFNameCharacter(character)) | (Number(isRDFSplitStartCharacter(character)) << 1) |
      (Number(isPythonWordCharacter(character)) << 2)
    digest.update(`${code}:${flags}\n`)
  }
  assert.equal(digest.digest('hex'), expected.predicates_sha256)
})
test('name categories keep Python words distinct from RDF split starts and extenders', () => {
  for (const [character, name, start, word] of [
    ['_', false, false, true], ['\u0301', true, false, false], ['\u2160', true, true, true],
    ['²', false, false, true], ['\u02b0', true, false, true], ['-', false, false, false],
    ['.', false, false, false], [String.fromCodePoint(0x105c0), false, false, false],
  ]) {
    assert.equal(isRDFNameCharacter(character), name)
    assert.equal(isRDFSplitStartCharacter(character), start)
    assert.equal(isPythonWordCharacter(character), word)
  }
  for (const invalid of ['', 'ab', null]) {
    assert.equal(isRDFNameCharacter(invalid), false)
    assert.equal(isRDFSplitStartCharacter(invalid), false)
    assert.equal(isPythonWordCharacter(invalid), false)
  }
})
