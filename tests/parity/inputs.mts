import assert from 'node:assert/strict'
import {createHash, type BinaryLike} from 'node:crypto'

export interface OracleInput {name: string, files: Record<string, BinaryLike | number[]>}
export interface OracleInputReceipt {inputs_sha256: unknown}

export function assertInputBytes(item: OracleInput, expected: OracleInputReceipt) {
  const inputs = Object.fromEntries(Object.entries(item.files).map(([name, value]) =>
    [name, createHash('sha256').update(Array.isArray(value) ? new Uint8Array(value) : value).digest('hex')]))
  assert.deepEqual(structuredClone(expected.inputs_sha256), inputs, `Oracle input bytes differ: ${item.name}`)
}
