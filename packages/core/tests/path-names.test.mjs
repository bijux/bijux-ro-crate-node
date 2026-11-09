import assert from 'node:assert/strict'
import test from 'node:test'
import {createWorkspace, snapshotFiles, fromDirectory} from '../src/index.js'
import {resolveCratePath} from '../src/crate/paths.js'

for (const name of ['\ud800.tsv', '\udfff.tsv', 'nested/\ud800.tsv', '\udc00\ud800.tsv'])
  test('selected paths reject ill-formed Unicode ' + JSON.stringify(name), () => {
    const files = new Map([[name, 'content']])
    for (const selected of [files, structuredClone(files), new Map(JSON.parse(JSON.stringify([...files])))]) {
      assert.throws(() => createWorkspace(selected), /Crate path contains an unpaired Unicode surrogate/)
      assert.throws(() => snapshotFiles(selected), /Crate path contains an unpaired Unicode surrogate/)
    }
    assert.throws(() => fromDirectory([{webkitRelativePath: 'crate/' + name}]), /unpaired Unicode surrogate/)
  })

for (const name of ['\ufffd.tsv', '\ud800\udc00.tsv', '\udbff\udfff.tsv', 'nested/\ud83d\ude00.tsv'])
  test('selected paths preserve Unicode ' + JSON.stringify(name), async () => {
    const selected = new Map([[name, 'content']])
    const workspace = createWorkspace(selected)
    assert.equal(await workspace.readText(name), 'content')
    assert.deepEqual([...snapshotFiles(selected).keys()], [name])
    assert.equal(new File(['content'], name).name, name)
  })

test('reference lookup does not replace malformed Unicode with another selected name', () => {
  const workspace = createWorkspace(new Map([['\ufffd.tsv', 'content']]))
  assert.equal(resolveCratePath('\ud800.tsv', new Set([''])), '\ud800.tsv')
  assert.equal(workspace.resolveFile('\ud800.tsv'), null)
  assert.equal(workspace.resolveFile('\ufffd.tsv'), '\ufffd.tsv')
})

test('the stripped outer directory does not become a selected crate-relative name', () => {
  const file = {webkitRelativePath: 'outer\ud800/good.tsv'}
  assert.deepEqual([...fromDirectory([file])], [['good.tsv', file]])
})

test('selected names use the captured well-formedness intrinsic', () => {
  const original = String.prototype.isWellFormed
  try {
    String.prototype.isWellFormed = () => true
    assert.throws(() => createWorkspace(new Map([['\ud800.tsv', 'content']])), /unpaired Unicode surrogate/)
  } finally {String.prototype.isWellFormed = original}
})
