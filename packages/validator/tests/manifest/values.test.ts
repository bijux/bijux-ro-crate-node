import assert from 'node:assert/strict'
import test from 'node:test'
import {inferColumn} from '../../src/manifest/values.js'

test('integer inference retains precision and pandas missing-value behavior', () => {
  assert.deepEqual(inferColumn(['9007199254740993', '9223372036854775807']).values,
    [9007199254740993n, 9223372036854775807n])
  assert.deepEqual(inferColumn(['001', 'NA', '2']).values, [1, null, 2])
  assert.deepEqual(inferColumn(['18446744073709551615', 'NA']).values,
    ['18446744073709551615', 'NA'])
})
