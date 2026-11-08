import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'

/** Require the actual results to cover one immutable case set exactly once. */
export function verifyCoverage(all, reports, {suite, source, shards}) {
  const names = all.map(item => item.name)
  const digest = createHash('sha256').update(JSON.stringify(all)).digest('hex')
  assert.equal(new Set(names).size, names.length, 'Expected case names repeat')
  assert.equal(reports.length, shards, 'A required shard report is missing or duplicated')
  const indexes = new Set(), executed = []
  for (const report of reports) {
    const selection = report.selection
    assert.ok(selection, 'Missing case selection receipt')
    assert.equal(selection.suite, suite, 'A report belongs to another suite')
    assert.equal(selection.source_sha, source, 'A report belongs to another source')
    assert.equal(selection.case_set_sha256, digest, 'A report belongs to another case set')
    assert.equal(selection.full_case_count, all.length, 'A report omitted expected cases')
    assert.equal(selection.shard.total, shards, 'Shard counts disagree')
    const index = selection.shard.index
    assert.ok(Number.isInteger(index) && index >= 0 && index < shards, 'Invalid shard index')
    assert.ok(!indexes.has(index), 'A shard index repeats')
    indexes.add(index)
    const expected = names.filter((_, position) => position % shards === index)
    assert.deepEqual(selection.case_names, expected, 'A shard selected the wrong cases')
    assert.deepEqual(report.actual_executed_case_names, expected, 'Actual case execution differs')
    assert.equal(report.total, expected.length, 'A shard has the wrong result count')
    assert.equal(report.passed, expected.length, 'A shard contains a failed case')
    assert.equal(report.failed ?? 0, 0, 'A shard contains a failed case')
    for (const key of ['failures', 'unexpected', 'pageErrors'])
      assert.equal(report[key]?.length ?? 0, 0, 'A shard contains ' + key)
    executed.push(...report.actual_executed_case_names)
  }
  assert.equal(new Set(executed).size, all.length, 'Cases were duplicated or omitted')
  assert.deepEqual([...executed].sort(), [...names].sort(), 'The complete case set was not executed')
  return {suite, source_sha: source, case_set_sha256: digest, cases: all.length, shards}
}
