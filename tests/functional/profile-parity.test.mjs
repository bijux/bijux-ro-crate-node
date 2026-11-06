import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {localLoader} from '../../packages/validator/src/profile/loader.js'
import {validateBase} from '../../packages/validator/src/profile/validation.js'
import {createWorkspace as workspaceFor} from '@bijux/ro-crate-core'

const root = new URL('../parity/fixtures/test_minimal_valid_ro_crate/', import.meta.url)
const fixture = JSON.parse(await readFile(new URL('ro-crate-metadata.json', root), 'utf8'))
const workspace = workspaceFor(new Map([
  ['ro-crate-metadata.json', await readFile(new URL('ro-crate-metadata.json', root))],
  ['file_list.tsv', await readFile(new URL('file_list.tsv', root))]
]))
const options = {
  baseURL: 'file:///crate/ro-crate-metadata.json',
  documentLoader: localLoader()
}

test('generic REQUIRED profile accepts the minimal upstream crate directly', async () => {
  const issues = []
  await validateBase(structuredClone(fixture), [], workspace, issues, options)
  assert.deepEqual(issues, [])
})

for (const property of ['name', 'description', 'datePublished', 'license']) {
  test(`generic REQUIRED profile reports the missing root ${property} property`, async () => {
    const document = structuredClone(fixture)
    delete document['@graph'].find(entity => entity['@id'] === './')[property]
    const issues = []
    await validateBase(document, [], workspace, issues, options)

    assert.equal(issues.length, 1)
    assert.equal(issues[0].severity, 40)
    assert.equal(issues[0].location_description, 'At ro-crate object with @id: ./')
    assert.ok(issues[0].message.startsWith(
      `The Root Data Entity MUST have a \`${property}\` property (as specified by schema.org)`
    ))
  })
}
