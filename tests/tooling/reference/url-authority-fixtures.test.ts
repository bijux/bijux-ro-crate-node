import assert from 'node:assert/strict'
import test from 'node:test'
import {contributor} from '../../reference/url-authorities/checks.mjs'

test('URL authority fixtures reject a missing contributor', () => {
  assert.throws(() => contributor({'@graph': [{'@type': 'bia:Image', website: 'https://example.org'}]}),
    /Missing contributor in URL authority fixture/)
})

test('URL authority fixtures accept contributor types as strings and arrays', () => {
  for (const type of ['bia:Contributor', ['bia:Image', 'bia:Contributor']]) {
    const entity = {'@type': type, website: 'https://example.org'}
    assert.equal(contributor({'@graph': [entity]}), entity)
  }
})
