import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {executeRequest, isValidationResponse} from '../../src/worker/protocol.js'

test('worker response retains session, revision, job and complete outcome', async () => {
  const root = new URL('../../../../tests/parity/fixtures/test_minimal_valid_ro_crate/', import.meta.url)
  const files = new Map(await Promise.all(['ro-crate-metadata.json', 'file_list.tsv'].map(async name =>
    [name, await readFile(new URL(name, root), 'utf8')] as const)))
  const response = await executeRequest({session: 'selected-crate', revision: 4, id: 7, files})
  assert.deepEqual([response.session, response.revision, response.id], ['selected-crate', 4, 7])
  assert.equal(response.result.status, 'valid')
  assert.equal(isValidationResponse(response), true)
  assert.equal(isValidationResponse({result: {status: 'valid'}}), false)
  await assert.rejects(executeRequest({session: '', revision: 4, id: 7, files}), /correlated validation request/)
})

test('response guard narrows only complete validation results', () => {
  const candidates: unknown[] = [
    {session: 's', revision: 0, id: 0, result: {status: 'valid'}},
    {session: 's', revision: 0, id: 0, result: {status: 'incomplete', reason: 1, stage: 'input', report: {highest_error_level: null, issues: {}}}},
  ]
  for (const candidate of candidates) {
    if (isValidationResponse(candidate)) {
      const status: 'valid' | 'invalid' | 'incomplete' = candidate.result.status
      assert.fail(`accepted malformed ${status} response`)
    }
  }
})
