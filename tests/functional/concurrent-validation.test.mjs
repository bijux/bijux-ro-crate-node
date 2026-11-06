import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateCrate} from '../../packages/validator/src/index.js'

test('concurrent public calls preserve independent source and diagnostic state', async () => {
  const root = new URL('../parity/fixtures/test_minimal_valid_ro_crate/', import.meta.url)
  const entries = await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name =>
    [name, await readFile(new URL(name, root), 'utf8')]))
  const invalid = JSON.parse(entries[0][1])
  delete invalid['@graph'].find(item => item['@id'] === './').name
  const results = await Promise.all(Array.from({length: 8}, (_, index) =>
    validateCrate(new Map(index % 2 ? [[entries[0][0], JSON.stringify(invalid)], entries[1]] : entries))))
  for (const [index, result] of results.entries()) assert.equal(result.status, index % 2 ? 'invalid' : 'valid')
  const original = JSON.parse(entries[0][1])
  assert.ok(original['@graph'].find(item => item['@id'] === './').name)
})

test('an explicit worker budget expires without authorizing continuation', async () => {
  const {Session} = await import('../../packages/validator/src/browser/session.js')
  let terminated = false
  const session = new Session({debounceMs: 0, timeoutMs: 5,
    workerFactory: () => ({postMessage() {}, terminate() {terminated = true}})})
  try {
    const exhausted = new Promise(resolve => session.subscribe(state => {
      if (state.state === 'incomplete') resolve(state)
    }))
    session.select(new Map([['metadata.json', '{}']]))
    const state = await exhausted
    assert.match(state.result.reason, /execution budget/)
    assert.equal(state.eligible, false)
    assert.equal(terminated, true)
    assert.throws(() => session.continue(), /current revision/)
  } finally {session.dispose()}
})
