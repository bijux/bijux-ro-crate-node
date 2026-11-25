import assert from 'node:assert/strict'
import test from 'node:test'
import {selectCoverageAttempts} from '../support/coverage.mjs'

test('coverage selects the latest complete producer directory by attempt', () => {
  const names = ['browser-corpus-firefox-0-attempt-1', 'browser-corpus-firefox-0-attempt-2', 'browser-corpus-chromium-0-attempt-1', 'browser-corpus-webkit-0-attempt-1']
  assert.deepEqual(selectCoverageAttempts(names, 'browser-corpus', 1, 2), [names[2], names[1], names[3]])
  assert.deepEqual(selectCoverageAttempts(['oracle-0-attempt-1', 'oracle-1-attempt-1'], 'oracle', 2, 1), ['oracle-0-attempt-1', 'oracle-1-attempt-1'])
})

test('coverage rejects missing, unknown, duplicate and future producers', () => {
  const valid = ['browser-corpus-chromium-0-attempt-1', 'browser-corpus-firefox-0-attempt-1', 'browser-corpus-webkit-0-attempt-1']
  for (const names of [valid.slice(1), [...valid, valid[0]], [...valid, 'browser-corpus-firefox-0-attempt-3'], [...valid, 'browser-corpus-other-0-attempt-1'], [...valid, 'browser-corpus-firefox-0-attempt-01'], [...valid, 'browser-corpus-firefox-0-attempt-0']])
    assert.throws(() => selectCoverageAttempts(names, 'browser-corpus', 1, 2))
})

test('qualification workflows bind coverage producers to their run attempts', async () => {
  const {readFile} = await import('node:fs/promises')
  const validation = await readFile('.github/workflows/validation.yml', 'utf8')
  const candidate = await readFile('.github/workflows/package-candidate.yml', 'utf8')
  for (const [workflow, prefix] of [[validation, 'browser-corpus'], [candidate, 'candidate-browser-corpus']] as const) {
    assert.ok(workflow.includes(`name: ${prefix}-\${{ matrix.engine }}-\${{ matrix.shard }}-attempt-\${{ github.run_attempt }}`))
    assert.ok(workflow.includes(`pattern: ${prefix}-*-attempt-*`))
    assert.ok(workflow.includes(` 8 ${prefix}`))
  }
  assert.ok(validation.includes('name: oracle-${{ matrix.shard }}-attempt-${{ github.run_attempt }}'))
  assert.ok(validation.includes('pattern: oracle-*-attempt-*'))
  assert.ok(validation.includes('verify-coverage.mjs oracle artifacts/coverage 12 oracle'))
})
