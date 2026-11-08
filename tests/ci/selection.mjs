import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** Partition immutable case collections without changing their global identity. */
export function selectCases(all, {suite}) {
  assert.ok(typeof suite === 'string' && suite.length, 'A case suite is required')
  assert.ok(Array.isArray(all) && all.length, 'A case collection must not be empty')
  const names = all.map(item => item.name)
  assert.ok(names.every(name => typeof name === 'string' && name.length), 'Each case needs a stable name')
  assert.equal(new Set(names).size, names.length, 'Case names must be unique')
  const shard = process.env.BIJUX_TEST_SHARD ?? '0/1'
  const match = /^(\d+)\/([1-9]\d*)$/.exec(shard)
  assert.ok(match, 'BIJUX_TEST_SHARD must be a zero-based index/count')
  const index = Number(match[1]), total = Number(match[2])
  assert.ok(Number.isSafeInteger(index) && Number.isSafeInteger(total) && total <= 64 && index < total,
    'The shard index must be below its count, with at most 64 shards')
  const cases = all.filter((_, position) => position % total === index)
  assert.ok(cases.length, 'Each shard must execute at least one case')
  const source = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim()
  return {cases, receipt: {suite, source_sha: source, case_set_sha256: digest(all),
    full_case_count: all.length, shard: {index, total}, case_names: cases.map(item => item.name)}}
}

/** An unset selector retains the local all-engine qualification behavior. */
export function selectedEngines(engines) {
  const selected = process.env.BIJUX_TEST_ENGINE
  if (!selected) return Object.entries(engines)
  assert.ok(Object.hasOwn(engines, selected), 'Unknown BIJUX_TEST_ENGINE: ' + selected)
  return [[selected, engines[selected]]]
}

export function assertExecutedCases(receipt, actual) {
  assert.deepEqual(actual, receipt.case_names, 'Executed cases differ from the selected shard')
}
