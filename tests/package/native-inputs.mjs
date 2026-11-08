import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {compareResult} from '../parity/compare.mjs'

const modulePath = process.env.BIJUX_VALIDATOR_MODULE ?? '../../packages/validator/src/index.js'
const {validateCrate} = await import(new URL(modulePath, import.meta.url))
const oracle = JSON.parse(await readFile(new URL('../parity/expected/crates.json', import.meta.url)))
const expected = oracle.cases.find(c => c.name === 'upstream/test_minimal_valid_ro_crate')
const fixture = new URL('../parity/fixtures/test_minimal_valid_ro_crate/', import.meta.url)
const files = await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name => [name, await readFile(new URL(name, fixture))]))
for (const kind of ['Uint8Array', 'ArrayBuffer', 'zero-size', 'throwing-size']) {
  let calls = 0
  class Input extends Blob {
    get size() {calls++; if (kind === 'throwing-size') throw new Error('caller size'); return 0}
    arrayBuffer() {calls++; throw new Error('caller reader')}
  }
  const selected = new Map(files.map(([path, bytes]) => [path, kind.endsWith('size') ? new Input([bytes]) :
    runInNewContext(kind === 'Uint8Array' ? 'new Uint8Array(bytes)' : 'new Uint8Array(bytes).buffer', {bytes})]))
  const pending = validateCrate(selected)
  if (kind === 'Uint8Array') for (const value of selected.values()) value.fill(0)
  if (kind === 'ArrayBuffer') for (const value of selected.values()) new Uint8Array(value).fill(0)
  compareResult(await pending, expected, kind)
  assert.equal(calls, 0)
}
console.log(JSON.stringify({node: process.versions.node, imported_module: new URL(modulePath, import.meta.url).href, passed: 4}))
