import assert from 'node:assert/strict'

const unorderedGroups = new Set(['datatype-sameas-derived', 'datatype-sameas-explicit-datatype-control'])

/** Only the independently observed child ordering of these two groups varies. */
export function captureIdentity(row) {
  if (!unorderedGroups.has(row.name) || row.exception?.type !== 'ExceptionGroup' ||
      row.exception.children?.length !== 2) return row
  return {...row, exception: {...row.exception,
    children: [...row.exception.children].sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)}}
}

export function assertCaptureRecord(actual, expected) {
  assert.deepEqual(captureIdentity(actual), captureIdentity(expected), actual.name)
}
