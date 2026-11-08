import assert from 'node:assert/strict'
import test from 'node:test'
import {createWorkspace, decodeCrateReference, fromDirectory, snapshotFiles} from '../src/index.js'

test('selected POSIX colon names survive picker normalization and snapshots', async () => {
  const files = [
    Object.assign(new Blob(['table']), {webkitRelativePath: 'crate/a:b.tsv'}),
    Object.assign(new Blob(['pixel']), {webkitRelativePath: 'crate/sub/image:1.tif'}),
  ]
  const selected = fromDirectory(files)
  assert.deepEqual([...selected.keys()], ['a:b.tsv', 'sub/image:1.tif'])
  const workspace = createWorkspace(snapshotFiles(selected))
  for (const path of ['a:b.tsv', './a:b.tsv', decodeCrateReference('a%3Ab.tsv')]) {
    assert.equal(workspace.resolveFile(path), 'a:b.tsv')
    assert.equal(workspace.has(path), true)
    assert.equal(await workspace.readText(path), 'table')
  }
  assert.equal(await workspace.readText('sub/image:1.tif'), 'pixel')
  assert.equal(await workspace.readText(decodeCrateReference('sub%2Fimage%3A1.tif')), 'pixel')
})

test('colon support retains absolute, traversal and normalized-collision guards', async () => {
  const workspace = createWorkspace(new Map([['a:b.tsv', 'table'], ['sub/entry', '']]))
  for (const path of ['C:/outside', './C:/outside', './/C:/outside', 'C:\\outside', '\\\\server\\share', '/a:b.tsv', '../a:b.tsv',
    'sub/../../a:b.tsv', 'missing/../a:b.tsv', 'a:b.tsv/../a:b.tsv',
    decodeCrateReference('%2Fa:b.tsv'), decodeCrateReference('%2E%2E/a:b.tsv'),
    decodeCrateReference('sub%2F..%2F..%2Fa:b.tsv'), decodeCrateReference('a%00b.tsv')]) {
    assert.equal(workspace.has(path), false, path)
    assert.equal(workspace.resolveFile(path), null, path)
    await assert.rejects(workspace.readText(path), undefined, path)
  }
  for (const path of ['C:/outside', './C:/outside', './/C:/outside', 'C:\\outside', '\\\\server\\share', '/a:b.tsv', '../a:b.tsv', 'a\0b'])
    assert.throws(() => createWorkspace(new Map([[path, '']])), undefined, path)
  assert.throws(() => createWorkspace(new Map([['a:b.tsv', ''], ['./a:b.tsv', '']])), /Ambiguous/)
  assert.throws(() => createWorkspace(new Map([['a:b', ''], ['a:b/file', '']])), /both a file and a directory/)
})

test('local scheme-shaped names never trigger URI loading', async () => {
  const workspace = createWorkspace(new Map([['https:/example.org/local', 'selected']]))
  assert.equal(workspace.resolveFile('https://example.org/local'), 'https:/example.org/local')
  assert.equal(await workspace.readText('https://example.org/local'), 'selected')
  assert.equal(workspace.resolveFile('https://example.org/missing'), null)
})
