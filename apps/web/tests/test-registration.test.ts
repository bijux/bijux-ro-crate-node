import assert from 'node:assert/strict'
import {test} from 'node:test'
import {registrationProblems} from '../test-registration.mts'

test('test registration detects missing and obsolete app test paths', () => {
  const scripts = {'test': 'node --test tests/example.test.ts tests/gone.test.ts', 'test:e2e': 'node --test tests/recovery/journey.test.ts'}
  assert.deepEqual(registrationProblems(['tests/example.test.ts', 'tests/recovery/journey.test.ts', 'tests/unlisted.test.ts'], scripts), {
    unregistered: ['tests/unlisted.test.ts'], missing: ['tests/gone.test.ts'], invalidDelegates:[],
  })
})

test('non-test scripts do not register tests', () => {
  assert.deepEqual(registrationProblems(['tests/unlisted.test.ts'], {build: 'echo tests/unlisted.test.ts'}), {
    unregistered: ['tests/unlisted.test.ts'], missing: [], invalidDelegates:[],
  })
})

test('a test path mentioned without a node test invocation is not registered', () => {
  assert.deepEqual(registrationProblems(['tests/unlisted.test.ts'], {'test': 'echo tests/unlisted.test.ts'}), {
    unregistered: ['tests/unlisted.test.ts'], missing: [], invalidDelegates:[],
  })
})

test('a delegated runner registers only its exact script and selected tests', () => {
  const selected = {script:'test:local-registration', command:'node --import tsx tests/registration/run-disposable.ts', files:['tests/registration/journey.test.ts']}
  assert.deepEqual(registrationProblems(selected.files, {[selected.script]:selected.command}, [selected]), {unregistered:[], missing:[], invalidDelegates:[]})
  assert.deepEqual(registrationProblems(selected.files, {[selected.script]:'echo tests/registration/run-disposable.ts'}, [selected]), {unregistered:selected.files, missing:[], invalidDelegates:[selected.script]})
  assert.deepEqual(registrationProblems([], {[selected.script]:selected.command}, [selected]), {unregistered:[], missing:selected.files, invalidDelegates:[]})
})

test('a path merely mentioned in a delegated runner does not register it', () => {
  const selected = {script:'test:local-registration', command:'node --import tsx tests/registration/run-disposable.ts', files:['tests/registration/journey.test.ts']}
  assert.deepEqual(registrationProblems([...selected.files, 'tests/registration/other.test.ts'], {[selected.script]:selected.command + ' # tests/registration/other.test.ts'}, [selected]), {
    unregistered:['tests/registration/journey.test.ts', 'tests/registration/other.test.ts'], missing:[], invalidDelegates:[selected.script],
  })
})

test('missing runner scripts and malformed or empty selections fail closed', () => {
  const selection = {script:'test:local-registration', command:'node --import tsx tests/registration/run-disposable.ts', files:['tests/registration/journey.test.ts']}
  assert.deepEqual(registrationProblems(selection.files, {}, [selection]), {unregistered:selection.files, missing:[], invalidDelegates:[selection.script]})
  assert.deepEqual(registrationProblems([], {[selection.script]:selection.command}, [{...selection, files:[]}]), {unregistered:[], missing:[], invalidDelegates:[selection.script]})
  assert.deepEqual(registrationProblems([], {[selection.script]:selection.command}, [{...selection, files:['../outside.test.ts']}]), {unregistered:[], missing:[], invalidDelegates:[selection.script]})
})
