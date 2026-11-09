import assert from 'node:assert/strict'

/** Only the independently observed ordering of this error group's two children varies. */
export function captureIdentity(row) {
  if (row.name !== 'datatype-sameas-derived' || row.exception?.type !== 'ExceptionGroup' ||
      row.exception.children?.length !== 2) return row
  return {...row, exception: {...row.exception,
    children: [...row.exception.children].sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)}}
}

export function assertCaptureRecord(actual, expected) {
  assert.deepEqual(captureIdentity(actual), captureIdentity(expected), actual.name)
}
