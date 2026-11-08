import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'

const [path, ...extra] = process.argv.slice(2)
assert.ok(path && !extra.length, 'Expected one imported-root primitive capture')
const bytes = await readFile(new URL('original-import-primitive.json', import.meta.url))
const original = JSON.parse(bytes)
const capture = JSON.parse(await readFile(path))
assert.equal(capture.inputs_sha256, createHash('sha256').update(bytes).digest('hex'))
for (const key of ['reference', 'python', 'rdflib', 'pyld'])
  assert.equal(capture[key], original.capture_metadata[key])
assert.deepEqual(capture.cases, [original.expected])
console.log('Original imported-root RDF and standard outcomes retained exactly')
