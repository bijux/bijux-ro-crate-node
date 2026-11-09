import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../src/index.js'
import {assertInputBytes} from '../../../../tests/parity/inputs.mjs'
import {compareResult} from '../../../../tests/parity/compare.mjs'

const read = path => readFile(new URL('../../../../tests/parity/' + path, import.meta.url), 'utf8').then(JSON.parse)
const snapshot = await read('expected/crates.json')
const expected = new Map(snapshot.cases.map(item => [item.name, item]))
const cases = (await Promise.all(['metadata-date-unicode.json', 'metadata-file-authorities.json', 'metadata-integer-unicode.json']
  .map(name => read('inputs/' + name)))).flatMap(input => input.cases)
assert.equal(cases.length, 36)

for (const item of cases) test('metadata diagnostic precedence: ' + item.name, async () => {
  const before = structuredClone(item.files)
  const reference = expected.get(item.name)
  assertInputBytes(item, reference)
  compareResult(await validateCrate(new Map(Object.entries(item.files))), reference, item.name)
  assert.deepEqual(item.files, before)
})
