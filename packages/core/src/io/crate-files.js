// FileList entries have a shared outer directory. Map keys are already crate-relative.
export function fromDirectory(files) {
  const result = new Map()
  let root
  for (const file of files) {
    const path = file.webkitRelativePath
    if (!path || !path.includes('/')) throw new Error('Select the crate directory using a directory picker.')
    const [outer, ...parts] = path.split('/')
    root ??= outer
    if (root !== outer) throw new Error('Select a single crate directory.')
    const key = safePath(parts.join('/'))
    if (result.has(key)) throw new Error('Duplicate selected path: ' + key)
    result.set(key, file)
  }
  return result
}

function safePath(path) {
  if (typeof path !== 'string' || !path || /[\\\x00]/.test(path) || /^(\/|[A-Za-z][A-Za-z0-9+.-]*:)/.test(path)) {
    throw new Error('Expected a path relative to the selected crate.')
  }
  const parts = path.split('/')
  if (parts.includes('..')) throw new Error('Path escapes the selected crate: ' + path)
  return parts.filter(x => x && x !== '.').join('/')
}

export function createWorkspace(files) {
  if (!files || typeof files.entries !== 'function' || typeof files.get !== 'function')
    throw new TypeError('Expected a Map of crate-relative paths to files.')
  const index = new Map()
  const directories = new Set([''])
  for (const [key, value] of files.entries()) {
    const path = safePath(key)
    if (!path || index.has(path)) throw new Error('Ambiguous crate entry: ' + key)
    index.set(path, cloneValue(value))
    for (let cut = path.lastIndexOf('/'); cut >= 0; cut = path.lastIndexOf('/', cut - 1)) {
      directories.add(path.slice(0, cut))
    }
  }
  return {
    has(key) {
      const path = safePath(key)
      return index.has(path) || directories.has(path)
    },
    async readText(key) {
      const path = safePath(key)
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
  if (value instanceof Uint8Array) return value.slice()
  if (value instanceof ArrayBuffer) return value.slice(0)
  return value
}

export function snapshotFiles(files) {
  const snapshot = new Map()
  for (const [path, value] of files) snapshot.set(path, cloneValue(value))
  createWorkspace(snapshot)
  return snapshot
}
