import '../../packages/validator/dist/worker.js'

const reads = []
const arrayBuffer = Blob.prototype.arrayBuffer
Blob.prototype.arrayBuffer = function () {
  reads.push(this.name ?? '(blob)')
  if (this.name === 'unrelated.tif') throw new Error('Unrelated image bytes were read')
  return arrayBuffer.call(this)
}
const post = self.postMessage.bind(self)
self.postMessage = data => post({...data, reads: [...reads]})
