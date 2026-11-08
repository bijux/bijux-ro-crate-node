import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {datatypeLexicalError} from '../../src/profile/inference/datatype-lexical.js'
const oracle = JSON.parse(await readFile(new URL('../../../../tests/parity/expected/datatype-errors.json', import.meta.url)))
for (const item of oracle.cases) test(item.datatype + ' lexical ' + JSON.stringify(item.lexical) + ' from ' + JSON.stringify(item.input), () => {
  let outcome
  try {outcome = datatypeLexicalError({value: item.lexical, datatype: {value: item.datatype}}) ? 'error-node' : 'valid'}
  catch {outcome = 'incomplete'}
  assert.equal(outcome, item.outcome)
})

test('the recording boundary suppresses only proven non-ValueError converter failures', async () => {
  const {datatypeErrorMessages} = await import('../../src/profile/inference/datatypes.js')
  const literal = (value, type) => ({termType: 'Literal', value, datatype: {value: 'http://www.w3.org/2001/XMLSchema#' + type}})
  assert.deepEqual([...datatypeErrorMessages({graph: [{object: literal('bad', 'decimal')}, {object: literal('', 'date')} ]})], [])
  const failure = new Error('unrelated adapter failure')
  const term = literal('1', 'integer')
  Object.defineProperty(term, 'value', {get() {throw failure}})
  assert.throws(() => datatypeErrorMessages({graph: [{object: term}]}), error => error === failure)
})
