import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '@bijux/ro-crate-validator'

assert.equal((await validateCrate(new Map())).status, 'incomplete')
assert.ok(import.meta.resolve('@bijux/ro-crate-validator/worker').endsWith('/dist/worker.js'))
assert.ok(import.meta.resolve('@bijux/ro-crate-validator/browser').endsWith('/dist/browser.js'))
const selected = new Map<string, string>(await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name =>
  [name, await readFile(new URL('./' + name, import.meta.url), 'utf8')] as [string, string])))
const url = 'https://example.org/contexts/propagation'
const document = JSON.parse(selected.get('ro-crate-metadata.json')!)
document['@context'].push(url)
selected.set('ro-crate-metadata.json', JSON.stringify(document))
for (const serialized of [false, true]) for (const propagate of [false, true]) {
  const context = {'@context': {'@propagate': propagate}}
  const result = await validateCrate(selected, {contexts: new Map([[url, serialized ? JSON.stringify(context) : context]])})
  assert.equal(result.status, 'valid')
  assert.equal(result.report.highest_error_level, null)
  assert.deepEqual(result.report.issues.ERROR, [])
}
