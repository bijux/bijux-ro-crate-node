import assert from 'node:assert/strict'

const unorderedGroups = new Map([
  ['datatype-sameas-derived', 2], ['datatype-sameas-explicit-datatype-control', 2],
  ['owl-errors/alldifferent-2-members', 4], ['owl-errors/alldifferent-3-members', 4],
  ['branching-collections/disjoint-shared-prefix', 2],
])

/** Only the independently observed child ordering of these five bounded groups varies. */
export function captureIdentity(row) {
  if (!unorderedGroups.has(row.name) || row.exception?.type !== 'ExceptionGroup' ||
      row.exception.children?.length !== unorderedGroups.get(row.name)) return row
  return {...row, exception: {...row.exception,
    children: [...row.exception.children].sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)}}
}

export function assertCaptureRecord(actual, expected) {
  assert.deepEqual(captureIdentity(actual), captureIdentity(expected), actual.name)
}
