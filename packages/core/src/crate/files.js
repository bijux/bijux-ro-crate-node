import {normalizeCratePath, resolveCratePath} from './paths.js'

const blobType = Object.getOwnPropertyDescriptor(Blob.prototype, 'type').get

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
  for (const path of index.keys()) {
    if (directories.has(path)) throw new Error('Crate entry is both a file and a directory: ' + path)
  }
  return {
    has(key) {
      try {
        const path = resolveCratePath(key, directories)
        return path !== null && (index.has(path) || directories.has(path))
      } catch {return false}
    },
    async readText(key) {
      const path = resolveCratePath(key, directories)
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
  // Read native storage without invoking methods overridden by input subclasses.
  if (value instanceof ArrayBuffer) return new Uint8Array(value).slice().buffer
  if (value instanceof Blob) return new Blob([value], {type: blobType.call(value)})
  if (typeof value === 'string') return value
  throw new TypeError('Crate files must contain text, Blob, Uint8Array or ArrayBuffer values.')
}

export function snapshotFiles(files) {
  const snapshot = new Map()
  for (const [path, value] of files) snapshot.set(path, cloneValue(value))
  createWorkspace(snapshot)
  return snapshot
}
