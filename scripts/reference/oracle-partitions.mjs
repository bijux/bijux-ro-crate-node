import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {assertInputBytes} from '../../tests/parity/inputs.mjs'

export const corpusHash = cases => createHash('sha256').update(JSON.stringify(cases)).digest('hex')

/** Independent oracle processes retain exact input receipts and original order. */
export async function capturePartitions({cases, jobs, reference, metadata, run}) {
  assert.ok(jobs === 1 || jobs === 2, 'Oracle jobs must be 1 or 2')
  assert.ok(cases.length >= jobs, 'Each oracle process requires at least one case')
  assert.equal(new Set(cases.map(item => item.name)).size, cases.length, 'Duplicate oracle input name')
  const groups = Array.from({length: jobs}, (_, index) => cases.filter((_, position) => position % jobs === index))
  const settled = await Promise.allSettled(groups.map((items, index) => Promise.resolve().then(() => run(items, index))))
  const failures = settled.filter(item => item.status === 'rejected').map(item => item.reason)
  if (failures.length) throw new AggregateError(failures, 'Independent oracle capture failed')
  const captures = settled.map(item => item.value)
  const rows = new Map()
  for (const [index, oracle] of captures.entries()) {
    const items = groups[index]
    assert.equal(oracle.commit, reference.commit, 'Oracle source commit differs')
    assert.equal(oracle.python, metadata.python, 'Oracle Python version differs')
    assert.equal(oracle.context_sha256, metadata.context_sha256, 'Oracle context bytes differ')
    assert.deepEqual(Object.keys(oracle.versions).sort(), [...new Set([...Object.keys(metadata.versions), 'bia-ro-crate-validator'])].sort(), 'Oracle version metadata is incomplete')
    for (const [name, expected] of Object.entries(metadata.versions))
      assert.equal(oracle.versions[name], expected, 'Oracle dependency version differs: ' + name)
    assert.ok(typeof oracle.imported_module === 'string' && oracle.imported_module.length, 'Missing oracle import provenance')
    for (const field of ['commit', 'python', 'versions', 'context_sha256', 'imported_module'])
      assert.deepEqual(oracle[field], captures[0][field], 'Oracle process metadata differs: ' + field)
    assert.equal(oracle.corpus_sha256, corpusHash(items), 'Oracle partition input digest differs')
    assert.deepEqual(oracle.cases.map(item => item.name), items.map(item => item.name), 'Oracle partition case identities differ')
    for (const [position, item] of items.entries()) {
      const row = oracle.cases[position]
      assertInputBytes(item, row)
      assert.ok(!rows.has(item.name), 'Duplicate oracle result')
      rows.set(item.name, row)
    }
  }
  assert.equal(rows.size, cases.length, 'Oracle omitted input cases')
  return {...captures[0], corpus_sha256: corpusHash(cases), cases: cases.map(item => rows.get(item.name))}
}
