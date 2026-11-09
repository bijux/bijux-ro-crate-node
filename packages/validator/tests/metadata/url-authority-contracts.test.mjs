import assert from 'node:assert/strict'
import test from 'node:test'
import {validateCrate} from '../../src/index.js'
import {cases, originalByName, assertResult, approvedDifferences, rejected} from '../../../../tests/reference/url-authorities/checks.mjs'

for (const item of cases) {
  test(item.name + ' retains its bounded complete-report contract', async () => {
    const actual = await validateCrate(new Map(Object.entries(item.files)))
    assertResult(item, actual)
    const document = JSON.parse(item.files['ro-crate-metadata.json'])
    const website = document['@graph'].find(node => node['@type']?.includes('bia:Contributor')).website
    assert.equal(URL.canParse(website), !rejected.has(item.name))
    for (const change of [
      copy => {copy.status = actual.status === 'valid' ? 'invalid' : 'valid'},
      copy => {copy.report.issues.INFO.push({message: 'Unrelated finding', severity: 20, location_description: null})},
      copy => {copy.report.highest_error_level = 'CRITICAL'},
    ]) {
      const changed = structuredClone(actual)
      change(changed)
      assert.throws(() => assertResult(item, changed), undefined, item.name)
    }
    if (approvedDifferences.has(item.name)) {
      assert.throws(() => assertResult(item, originalByName.get(item.name)), /Completion status differs/)
      const changed = structuredClone(actual)
      changed.report.issues.ERROR[0].message = 'Unrelated rejection'
      assert.throws(() => assertResult(item, changed))
    }
    const changed = structuredClone(item)
    changed.files['file_list.tsv'] += 'unregistered\t\n'
    assert.throws(() => assertResult(changed, actual), /registration/)
    const contexts = structuredClone(item)
    contexts.contexts = {'https://example.org/unregistered': {'@context': {}}}
    assert.throws(() => assertResult(contexts, actual), /registration/)
    // Exports are caller-owned views, never the comparison's expected records.
    const exported = originalByName.get(item.name)
    originalByName.set(item.name, structuredClone(changed))
    assertResult(item, actual)
    originalByName.set(item.name, exported)
  })
}
