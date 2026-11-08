import {normalizeCratePath, resolveCratePath} from './paths.js'
import {cloneFileValue, fileText} from './file-values.js'

export function createWorkspace(files) {
  if (!files || typeof files.entries !== 'function' || typeof files.get !== 'function')
    throw new TypeError('Expected a Map of crate-relative paths to files.')
  const index = new Map()
  const directories = new Set([''])
  for (const [key, value] of files.entries()) {
    const path = normalizeCratePath(key)
    if (!path || index.has(path)) throw new Error('Ambiguous crate entry: ' + key)
    index.set(path, cloneFileValue(value))
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
    resolveFile(key) {
      try {
        const path = resolveCratePath(key, directories)
        return path !== null && index.has(path) ? path : null
      } catch {return null}
    },
    async readText(key) {
      const path = resolveCratePath(key, directories)
      const value = index.get(path)
      if (value === undefined) throw new Error('Missing local file: ' + key)
      return fileText(value)
    }
  }
}

export function snapshotFiles(files) {
  const snapshot = new Map()
  for (const [path, value] of files) snapshot.set(path, cloneFileValue(value))
  createWorkspace(snapshot)
  return snapshot
}
