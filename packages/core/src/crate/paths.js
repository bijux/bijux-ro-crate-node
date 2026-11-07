export function normalizeCratePath(path) {
  if (typeof path !== 'string' || !path || /[\\\x00]/.test(path) || /^(\/|[A-Za-z][A-Za-z0-9+.-]*:)/.test(path)) {
    throw new Error('Expected a path relative to the selected crate.')
  }
  const parts = path.split('/')
  if (parts.includes('..')) throw new Error('Path escapes the selected crate: ' + path)
  return parts.filter(x => x && x !== '.').join('/')
}

/** Decode reference escapes without normalizing or granting filesystem access. */
export function decodeCrateReference(reference) {
  if (typeof reference !== 'string') throw new TypeError('Expected a crate reference string.')
  return reference.replace(/(?:%[\da-f]{2})+/gi, encoded =>
    new TextDecoder('utf-8', {ignoreBOM: true}).decode(Uint8Array.from(
      encoded.match(/%[\da-f]{2}/gi), byte => parseInt(byte.slice(1), 16))))
}
