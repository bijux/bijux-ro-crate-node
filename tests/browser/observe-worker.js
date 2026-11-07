import '../../packages/validator/dist/worker.js'

const reads = []
let paths = new Map()
const arrayBuffer = Blob.prototype.arrayBuffer
Blob.prototype.arrayBuffer = function () {
  const path = paths.get(this.size) ?? '(unregistered blob)'
  reads.push(path)
  if (path === 'unrelated.tif') throw new Error('Unrelated image bytes were read')
  return arrayBuffer.call(this)
}
const validate = self.onmessage
self.onmessage = event => {
  // Snapshots may be plain Blobs. Unique fixture sizes bind reads to paths
  // without loading payload bytes or depending on File-specific metadata.
  paths = new Map()
  reads.length = 0
  for (const [path, value] of event.data.files) {
    if (!(value instanceof Blob) || paths.has(value.size)) throw new Error('Read-observation fixture requires unique Blob sizes')
    paths.set(value.size, path)
  }
  return validate.call(self, event)
}
const post = self.postMessage.bind(self)
self.postMessage = data => post({...data, reads: [...reads]})
