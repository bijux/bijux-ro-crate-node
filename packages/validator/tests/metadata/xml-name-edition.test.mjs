import assert from 'node:assert/strict'
import test from 'node:test'
import {validateCrate} from '../../src/index.js'
import {cases, assertResult, expected, originalByName, approvedDifferences} from '../../../../tests/reference/xml-name-edition/checks.mjs'
import {asciiNameCounterpart} from '../../../../tests/reference/xml-name-edition/names.mjs'

for (const item of cases) test('XML name edition report: ' + item.name, async () => {
  assertResult(item, await validateCrate(new Map(Object.entries(item.files))))
})

for (const item of cases) for (const level of ['ERROR', 'WARNING', 'INFO'])
  test('XML name contract rejects extra ' + level + ': ' + item.name, () => {
    const result = structuredClone(expected.get(item.name))
    result.report.issues[level].push({message: 'Unexpected finding', severity: {ERROR: 40, WARNING: 30, INFO: 20}[level], location_description: null})
    assert.throws(() => assertResult(item, result))
  })

test('XML name contracts reject changed inputs and unknown contexts', () => {
  const item = structuredClone(cases[0])
  item.files['ro-crate-metadata.json'] += ' '
  assert.throws(() => assertResult(item, expected.get(item.name)), /input bytes differ/)
  const context = {...cases[0], contexts: {'https://example.org/unregistered': {'@context': {}}}}
  assert.throws(() => assertResult(context, expected.get(context.name)))
  assert.throws(() => assertResult({...cases[0], name: 'xml-name-edition/unregistered'}, expected.get(cases[0].name)), /Unregistered/)
})

test('XML name contracts retain context identity when an exported fixture changes', () => {
  const item = cases[0], original = item.contexts
  try {
    item.contexts = {'https://example.org/unregistered': {'@context': {}}}
    assert.throws(() => assertResult(item, expected.get(item.name)))
  } finally {
    if (original === undefined) delete item.contexts
    else item.contexts = original
  }
})

for (const name of approvedDifferences) test('XML name contract retains the original differing outcome: ' + name, () => {
  assert.throws(() => assertResult(cases.find(item => item.name === name), originalByName.get(name)))
})

for (const item of cases.filter(item => expected.get(item.name).status === 'invalid'))
  for (const field of ['message', 'location_description']) test('XML name contract checks exact ' + field + ': ' + item.name, () => {
    const result = structuredClone(expected.get(item.name))
    const finding = Object.values(result.report.issues).find(values => values.length)[0]
    finding[field] = (finding[field] ?? '') + ' changed'
    assert.throws(() => assertResult(item, result))
  })

for (const [role, fragment] of [
  ['element', '<ͽx>ͽ</ͽx>'],
  ['attribute', '<x ͽx="ͽ"></x>'],
  ['processing-instruction', '<?ͽx ͽ?>'],
  ['element', '<ͽx/>\n'],
  ['attribute', '<x ͽx="v"/>\n'],
  ['processing-instruction', '<?ͽx?>\n'],
]) test('XML name qualification rejects modern characters in ' + role + ' data', () => {
  assert.throws(() => asciiNameCounterpart(fragment, {role, character: 'ͽ'}, 'BijuxName'), /cannot replace character data/)
})
