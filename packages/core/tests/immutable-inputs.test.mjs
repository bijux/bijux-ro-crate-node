import assert from 'node:assert/strict'
import test from 'node:test'
import {createWorkspace, snapshotFiles} from '../src/index.js'

test('workspace owns mutable byte buffers without reading unrelated blobs', async () => {
  const bytes = new TextEncoder().encode('original')
  let reads = 0
  class Payload extends Blob {async arrayBuffer() {reads++; throw new Error('unexpected payload read')}}
  const files = new Map([['metadata.json', bytes], ['image.tif', new Payload(['image'])]])
  const workspace = createWorkspace(files)
  bytes.fill(0)
  files.clear()
  assert.equal(await workspace.readText('metadata.json'), 'original')
  assert.equal(reads, 0)
})

test('a draft snapshot detaches caller buffers and map membership', async () => {
  const source = new Map([['metadata.json', new TextEncoder().encode('snapshot')]])
  const snapshot = snapshotFiles(source)
  source.get('metadata.json').fill(0)
  source.clear()
  assert.equal(await createWorkspace(snapshot).readText('metadata.json'), 'snapshot')
})


test('Node Buffer snapshots own bytes instead of retaining Buffer.slice views', async () => {
  const bytes = Buffer.from('captured')
  const files = new Map([['metadata.json', bytes]])
  const workspace = createWorkspace(files)
  const snapshot = snapshotFiles(files)
  bytes.fill(0)
  assert.equal(await workspace.readText('metadata.json'), 'captured')
  assert.equal(await createWorkspace(snapshot).readText('metadata.json'), 'captured')
})

test('snapshots reject mutable values outside the public byte and Blob contract', () => {
  assert.throws(() => snapshotFiles(new Map([['image.tif', {mutable: true}]])), /Crate files must contain/)
})
