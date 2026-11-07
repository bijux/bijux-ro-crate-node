import assert from 'node:assert/strict'
import test from 'node:test'
import {checkConnectivity} from '../../src/validation/connectivity.js'

test('metadata and manifest references jointly determine inbound connectivity', () => {
  const metadata = {entities: new Map([
    ['ro-crate-metadata.json', {'@id': 'ro-crate-metadata.json', about: {'@id': './'}}],
    ['./', {'@id': './', author: [{'@id': '#author'}]}],
    ['#author', {'@id': '#author'}],
    ['#specimen', {'@id': '#specimen'}],
  ])}
  const issues = []
  checkConnectivity(metadata, new Set(['#specimen']), issues)
  assert.deepEqual(issues, [])
  checkConnectivity(metadata, new Set(), issues)
  assert.equal(issues[0].severity, 30)
  assert.match(issues[0].message, /#specimen$/)
})
