// Inputs here are selected local names, not URI strings. A colon is legal in
// a POSIX filename; only drive-absolute spellings need an additional guard.
export function normalizeCratePath(path) {
  if (typeof path !== 'string' || !path || /[\\\x00]/.test(path) || /^(\/|[A-Za-z]:\/)/.test(path)) {
    throw new Error('Expected a path relative to the selected crate.')
  }
  const parts = path.split('/')
  if (parts.includes('..')) throw new Error('Path escapes the selected crate: ' + path)
  const normalized = parts.filter(x => x && x !== '.').join('/')
  if (/^[A-Za-z]:\//.test(normalized)) throw new Error('Expected a path relative to the selected crate.')
  return normalized
}

/** Resolve a reference through selected directories without leaving the crate. */
export function resolveCratePath(path, directories) {
  if (typeof path !== 'string' || !path || /[\\\x00]/.test(path) || /^(\/|[A-Za-z]:\/)/.test(path))
    throw new Error('Expected a path relative to the selected crate.')
  const parts = []
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) throw new Error('Path escapes the selected crate: ' + path)
      // Filesystem lookup requires the traversed directory to exist, even if
      // its name is immediately followed by a parent component.
      if (!directories.has(parts.join('/'))) return null
      parts.pop()
    } else parts.push(part)
  }
  const resolved = parts.join('/')
  if (/^[A-Za-z]:\//.test(resolved)) throw new Error('Expected a path relative to the selected crate.')
  return resolved
}

/** Decode reference escapes without normalizing or granting filesystem access. */
export function decodeCrateReference(reference) {
  if (typeof reference !== 'string') throw new TypeError('Expected a crate reference string.')
  return reference.replace(/(?:%[\da-f]{2})+/gi, encoded =>
    new TextDecoder('utf-8', {ignoreBOM: true}).decode(Uint8Array.from(
      encoded.match(/%[\da-f]{2}/gi), byte => parseInt(byte.slice(1), 16))))
}
