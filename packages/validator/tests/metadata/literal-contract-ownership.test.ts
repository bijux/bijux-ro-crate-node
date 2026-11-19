import assert from 'node:assert/strict'
import test from 'node:test'
import * as html from '../../../../tests/reference/html-tree-building/checks.mjs'
import * as xml from '../../../../tests/reference/xml-name-edition/checks.mjs'

for (const [name, family, expected] of [['HTML', html, html.correctedByName], ['XML', xml, xml.expected]] as const)
  test(name + ' grammar contracts retain their registered contexts independently of exported cases', () => {
    const item = family.cases.find(item => {
      const receipt = expected.get(item.name)
      assert.ok(receipt)
      return receipt.status === 'valid'
    })
    assert.ok(item)
    const stored = expected.get(item.name)
    assert.ok(stored)
    const result = structuredClone(stored)
    family.assertResult(item, result)
    const hadContexts = Object.hasOwn(item, 'contexts'), originalContexts = item.contexts
    try {
      item.contexts = {'https://example.org/changed-context': {'@context': {name: null}}}
      assert.throws(() => family.assertResult(item, result), {code: 'ERR_ASSERTION'})
    } finally {
      if (hadContexts) item.contexts = originalContexts
      else delete item.contexts
    }
    family.assertResult(item, result)
  })
