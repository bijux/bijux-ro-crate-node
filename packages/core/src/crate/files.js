import {normalizeCratePath} from './paths.js'

export function createWorkspace(files) {
  if (!files || typeof files.entries !== 'function' || typeof files.get !== 'function')
    throw new TypeError('Expected a Map of crate-relative paths to files.')
  const index = new Map()
  const directories = new Set([''])
  for (const [key, value] of files.entries()) {
    const path = normalizeCratePath(key)
    if (!path || index.has(path)) throw new Error('Ambiguous crate entry: ' + key)
    index.set(path, cloneValue(value))
    for (let cut = path.lastIndexOf('/'); cut >= 0; cut = path.lastIndexOf('/', cut - 1)) {
      directories.add(path.slice(0, cut))
    }
  }
  return {
    has(key) {
      const path = normalizeCratePath(key)
      return index.has(path) || directories.has(path)
    },
    async readText(key) {
      const path = normalizeCratePath(key)
      const value = index.get(path)
      if (value === undefined) throw new Error('Missing local file: ' + key)
      if (typeof value === 'string') return value
      const bytes = value instanceof Blob ? await value.arrayBuffer() : value
      if (!(bytes instanceof Uint8Array || bytes instanceof ArrayBuffer)) throw new Error('Unreadable file: ' + key)
      return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes)
    }
  }
}

function cloneValue(value) {
  if (value instanceof Uint8Array) return new Uint8Array(value)
  if (value instanceof ArrayBuffer) return value.slice(0)
  if (typeof value === 'string' || value instanceof Blob) return value
  throw new TypeError('Crate files must contain text, Blob, Uint8Array or ArrayBuffer values.')
}

export function snapshotFiles(files) {
  const snapshot = new Map()
  for (const [path, value] of files) snapshot.set(path, cloneValue(value))
  createWorkspace(snapshot)
  return snapshot
}
