export function normalizeCratePath(path) {
  if (typeof path !== 'string' || !path || /[\\\x00]/.test(path) || /^(\/|[A-Za-z][A-Za-z0-9+.-]*:)/.test(path)) {
    throw new Error('Expected a path relative to the selected crate.')
  }
  const parts = path.split('/')
  if (parts.includes('..')) throw new Error('Path escapes the selected crate: ' + path)
  return parts.filter(x => x && x !== '.').join('/')
}
