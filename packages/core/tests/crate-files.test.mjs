import assert from 'node:assert/strict'
import test from 'node:test'
import {fromDirectory, createWorkspace} from '../src/index.js'

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
