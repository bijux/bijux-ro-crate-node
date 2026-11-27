import assert from 'node:assert/strict'
import {test} from 'node:test'
import {registrationProblems} from '../test-registration.mts'

test('test registration detects missing and obsolete app test paths', () => {
  const scripts = {'test': 'node --test tests/example.test.ts tests/gone.test.ts', 'test:e2e': 'node --test tests/recovery/journey.test.ts'}
  assert.deepEqual(registrationProblems(['tests/example.test.ts', 'tests/recovery/journey.test.ts', 'tests/unlisted.test.ts'], scripts), {
    unregistered: ['tests/unlisted.test.ts'], missing: ['tests/gone.test.ts'],
  })
})

test('non-test scripts do not register tests', () => {
  assert.deepEqual(registrationProblems(['tests/unlisted.test.ts'], {build: 'echo tests/unlisted.test.ts'}), {
    unregistered: ['tests/unlisted.test.ts'], missing: [],
  })
})

test('a test path mentioned without a node test invocation is not registered', () => {
  assert.deepEqual(registrationProblems(['tests/unlisted.test.ts'], {'test': 'echo tests/unlisted.test.ts'}), {
    unregistered: ['tests/unlisted.test.ts'], missing: [],
  })
})
