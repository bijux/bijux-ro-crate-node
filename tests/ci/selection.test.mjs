import assert from 'node:assert/strict'
import test from 'node:test'
import {createHash} from 'node:crypto'
import {selectCases, selectedEngines, assertExecutedCases} from './selection.mjs'
import {verifyCoverage} from './coverage.mjs'

const cases = ['a', 'b', 'c', 'd', 'e'].map(name => ({name, files: {metadata: name}}))
function withEnvironment(name, value, run) {
  const previous = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
  try {return run()} finally {
    if (previous === undefined) delete process.env[name]
    else process.env[name] = previous
  }
}

test('local defaults retain every case and engine without changing inputs', () => {
  const original = structuredClone(cases)
  withEnvironment('BIJUX_TEST_SHARD', undefined, () => {
    const result = selectCases(cases, {suite: 'example'})
    assert.deepEqual(result.cases, cases)
    assert.deepEqual(result.receipt.shard, {index: 0, total: 1})
    assertExecutedCases(result.receipt, ['a', 'b', 'c', 'd', 'e'])
  })
  withEnvironment('BIJUX_TEST_ENGINE', undefined, () =>
    assert.deepEqual(selectedEngines({chromium: 1, firefox: 2, webkit: 3}),
      [['chromium', 1], ['firefox', 2], ['webkit', 3]]))
  assert.deepEqual(cases, original)
})

test('shards select complementary stable identities', () => {
  withEnvironment('BIJUX_TEST_SHARD', '0/2', () =>
    assert.deepEqual(selectCases(cases, {suite: 'example'}).receipt.case_names, ['a', 'c', 'e']))
  withEnvironment('BIJUX_TEST_SHARD', '1/2', () =>
    assert.deepEqual(selectCases(cases, {suite: 'example'}).receipt.case_names, ['b', 'd']))
  withEnvironment('BIJUX_TEST_ENGINE', 'webkit', () =>
    assert.deepEqual(selectedEngines({chromium: 1, webkit: 3}), [['webkit', 3]]))
})

test('invalid, duplicate and empty selections fail before execution', () => {
  for (const shard of ['-1/2', '2/2', '0/0', '0/65', '1', 'x/2', '5/6'])
    withEnvironment('BIJUX_TEST_SHARD', shard, () =>
      assert.throws(() => selectCases(cases, {suite: 'example'})))
  withEnvironment('BIJUX_TEST_SHARD', undefined, () => {
    assert.throws(() => selectCases([], {suite: 'example'}))
    assert.throws(() => selectCases([{name: 'a'}, {name: 'a'}], {suite: 'example'}))
  })
  withEnvironment('BIJUX_TEST_ENGINE', 'unknown', () => assert.throws(() => selectedEngines({webkit: 1})))
  assert.throws(() => assertExecutedCases({case_names: ['a', 'b']}, ['a', 'a']))
})

function reports() {
  const common = {suite: 'example', source_sha: 'source',
    case_set_sha256: createHash('sha256').update(JSON.stringify(cases)).digest('hex'), full_case_count: 5}
  return [['a', 'c', 'e'], ['b', 'd']].map((names, index) => ({
    selection: {...common, shard: {index, total: 2}, case_names: names},
    actual_executed_case_names: [...names], total: names.length, passed: names.length, failures: [],
  }))
}

test('coverage accepts complete results in any shard arrival order', () => {
  assert.equal(verifyCoverage(cases, reports().reverse(), {suite: 'example', source: 'source', shards: 2}).cases, 5)
})

test('coverage refuses missing, duplicate, foreign and unsuccessful execution', () => {
  const changes = [r => r.pop(), r => r.push(r[0]), r => {r[1].selection.shard.index = 0},
    r => {r[0].actual_executed_case_names.pop()}, r => {r[0].actual_executed_case_names[0] = 'unknown'},
    r => {r[0].selection.source_sha = 'other'}, r => {r[0].selection.case_set_sha256 = 'other'},
    r => {r[0].selection.full_case_count = 4}, r => {r[0].selection.suite = 'other'},
    r => {r[0].passed--}, r => {r[0].failures.push({name: 'a'})}, r => {r[0].pageErrors = ['broken']}]
  for (const change of changes) {
    const result = reports()
    change(result)
    assert.throws(() => verifyCoverage(cases, result, {suite: 'example', source: 'source', shards: 2}))
  }
})
