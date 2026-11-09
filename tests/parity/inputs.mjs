import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'

export function assertInputBytes(item, expected) {
  const inputs = Object.fromEntries(Object.entries(item.files).map(([name, value]) =>
    [name, createHash('sha256').update(Array.isArray(value) ? new Uint8Array(value) : value).digest('hex')]))
  assert.deepEqual(structuredClone(expected.inputs_sha256), inputs, `Oracle input bytes differ: ${item.name}`)
}
