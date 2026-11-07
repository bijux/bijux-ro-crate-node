import assert from 'node:assert/strict'
import test from 'node:test'
import {fromDirectory, createWorkspace, decodeCrateReference, snapshotFiles} from '../src/index.js'

test('directory picker strips exactly the shared outer directory', () => {
  const files = [
    {webkitRelativePath: 'crate/ro-crate-metadata.json'},
    {webkitRelativePath: 'crate/manifests/file_list.tsv'}
  ]
  assert.deepEqual([...fromDirectory(files)], [
    ['ro-crate-metadata.json', files[0]],
    ['manifests/file_list.tsv', files[1]]
  ])
  assert.throws(() => fromDirectory([
    ...files, {webkitRelativePath: 'other/file_list.tsv'}
  ]), /Select a single crate directory/)
})

test('crate-relative maps preserve nested paths and reject escape or normalized collisions', async () => {
  const workspace = createWorkspace(new Map([['manifests/file_list.tsv', 'file_path\n']]))
  assert.equal(workspace.has('manifests/'), true)
  assert.equal(await workspace.readText('manifests/file_list.tsv'), 'file_path\n')
  assert.throws(() => createWorkspace(new Map([['../file_list.tsv', '']])), /escapes/)
  assert.throws(() => createWorkspace(new Map([['/file_list.tsv', '']])), /relative/)
  assert.throws(() => createWorkspace(new Map([
    ['file_list.tsv', ''], ['./file_list.tsv', '']
  ])), /Ambiguous crate entry/)
})

test('directory entries require a nonempty crate-relative file name', () => {
  assert.throws(() => fromDirectory([{webkitRelativePath: 'crate/.'}]), /crate-relative name/)
})


test('crate references retain tolerant UTF-8 escape and encoded BOM semantics', () => {
  assert.equal(decodeCrateReference('nested/a%20b.tsv'), 'nested/a b.tsv')
  assert.equal(decodeCrateReference('file%ZZ.tsv'), 'file%ZZ.tsv')
  assert.equal(decodeCrateReference('file%FF.tsv'), 'file\ufffd.tsv')
  assert.equal(decodeCrateReference('%EF%BB%BFfile.tsv'), '\ufefffile.tsv')
  assert.equal(decodeCrateReference('file%2520.tsv'), 'file%20.tsv')
})

test('workspace reference lookup resolves selected parent directories and remains confined', async () => {
  const workspace = createWorkspace(new Map([['manifest.tsv', 'data'], ['nested/placeholder', '']]))
  assert.equal(await workspace.readText('nested/../manifest.tsv'), 'data')
  assert.equal(workspace.has('nested/../manifest.tsv'), true)
  assert.equal(workspace.has('missing/../manifest.tsv'), false)
  assert.equal(workspace.has('manifest.tsv/../manifest.tsv'), false)
  assert.equal(workspace.has('nested/../../manifest.tsv'), false)
  assert.equal(workspace.has('/manifest.tsv'), false)
  await assert.rejects(workspace.readText('nested/../../manifest.tsv'), /escapes/)
  await assert.rejects(workspace.readText('missing/../manifest.tsv'), /Missing local file/)
})

test('a selected entry cannot be both a file and a directory', () => {
  for (const files of [[['entry', ''], ['entry/data', '']], [['entry/data', ''], ['entry', '']]])
    assert.throws(() => createWorkspace(new Map(files)), /both a file and a directory/)
})

test('ArrayBuffer subclasses cannot retain mutable storage in a snapshot', async () => {
  class CallerBuffer extends ArrayBuffer { slice() { throw new Error('Caller slice must not run') } }
  const buffer = new CallerBuffer(4)
  new Uint8Array(buffer).set(new TextEncoder().encode('good'))
  const files = new Map([['metadata', buffer]])
  const snapshot = snapshotFiles(files)
  const workspace = createWorkspace(files)
  new Uint8Array(buffer).fill(0)
  assert.notEqual(snapshot.get('metadata'), buffer)
  assert.equal(Object.getPrototypeOf(snapshot.get('metadata')), ArrayBuffer.prototype)
  assert.equal(new TextDecoder().decode(snapshot.get('metadata')), 'good')
  assert.equal(await workspace.readText('metadata'), 'good')
})

test('Blob snapshots preserve native bytes and MIME type despite overridden accessors', async () => {
  class CallerBlob extends Blob {
    get type() { return 'application/json' }
    arrayBuffer() { throw new Error('Caller arrayBuffer must not run') }
    text() { throw new Error('Caller text must not run') }
  }
  const blob = new CallerBlob(['good'], {type: 'text/plain'})
  const files = new Map([['metadata', blob]])
  const snapshot = snapshotFiles(files).get('metadata')
  assert.equal(Object.getPrototypeOf(snapshot), Blob.prototype)
  assert.equal(snapshot.type, 'text/plain')
  assert.equal(await snapshot.text(), 'good')
  assert.equal(await createWorkspace(files).readText('metadata'), 'good')
})
