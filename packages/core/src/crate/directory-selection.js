import {normalizeCratePath} from './paths.js'

// FileList entries have a shared outer directory. Map keys are already crate-relative.
export function fromDirectory(files) {
  const result = new Map()
  let root
  for (const file of Array.from(files)) {
    const path = file.webkitRelativePath
    if (!path || !path.includes('/')) throw new Error('Select the crate directory using a directory picker.')
    const [outer, ...parts] = path.split('/')
    root ??= outer
    if (root !== outer) throw new Error('Select a single crate directory.')
    const key = normalizeCratePath(parts.join('/'))
    if (!key) throw new Error('Selected file must have a crate-relative name.')
    if (result.has(key)) throw new Error('Duplicate selected path: ' + key)
    result.set(key, file)
  }
  return result
}
