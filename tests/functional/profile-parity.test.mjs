import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {localLoader} from '../../packages/validator/src/profile/loader.js'
import {validateBaseProfile} from '../../packages/validator/src/profile/validation.js'
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
  await validateBaseProfile(structuredClone(fixture), workspace, issues, options)
  assert.deepEqual(issues, [])
})

for (const property of ['name', 'description', 'datePublished', 'license']) {
  test(`generic REQUIRED profile reports the missing root ${property} property`, async () => {
    const document = structuredClone(fixture)
    delete document['@graph'].find(entity => entity['@id'] === './')[property]
    const issues = []
    await validateBaseProfile(document, workspace, issues, options)

    assert.equal(issues.length, 1)
    assert.equal(issues[0].severity, 40)
    assert.equal(issues[0].location_description, 'At ro-crate object with @id: ./')
    assert.ok(issues[0].message.startsWith(
      `The Root Data Entity MUST have a \`${property}\` property (as specified by schema.org)`
    ))
  })
}


test('property chains follow finite lists and ignore malformed or cyclic list declarations', async () => {
  const rdf = (await import('rdf-validate-shacl/src/defaultEnv.js')).default
  const {materializeProperties} = await import('../../packages/validator/src/profile/property-inference.js')
  const node = value => rdf.namedNode('https://example.org/' + value)
  const first = rdf.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#first')
  const rest = rdf.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#rest')
  const nil = rdf.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#nil')
  const chain = rdf.namedNode('http://www.w3.org/2002/07/owl#propertyChainAxiom')
  const q = (a, p, b) => rdf.quad(node(a), p, b)
  const graph = rdf.dataset([
    q('a', node('parent'), node('b')), q('b', node('parent'), node('c')),
    q('ancestor', chain, node('list')), q('list', first, node('parent')),
    q('list', rest, node('tail')), q('tail', first, node('parent')), q('tail', rest, nil),
    q('broken', chain, node('not-a-list')), q('cyclic', chain, node('cycle')),
    q('cycle', first, node('parent')), q('cycle', rest, node('cycle')),
  ])
  materializeProperties(graph, rdf)
  assert.ok(graph.has(q('a', node('ancestor'), node('c'))))
  assert.equal(graph.match(null, node('broken')).size, 0)
  assert.equal(graph.match(null, node('cyclic')).size, 0)
})
