import assert from 'node:assert/strict'
import test from 'node:test'
import {createWorkspace, snapshotFiles} from '../src/index.js'

for (const [name, text] of [
  ['leading high surrogate', '\ud800text'],
  ['trailing high surrogate', 'text\udbff'],
  ['low surrogate', '\udc00'],
  ['reversed pair', '\udc00\ud800'],
  ['interrupted pair', '\ud800x\udc00'],
]) test('selected text rejects ' + name, () => {
  const files = new Map([['metadata.json', text]])
  assert.throws(() => createWorkspace(files), /unpaired Unicode surrogate/)
  assert.throws(() => snapshotFiles(files), /unpaired Unicode surrogate/)
  assert.equal(files.get('metadata.json'), text)
})

for (const [name, text] of [
  ['ASCII JSON escape', '{"value":"\\ud800"}'],
  ['astral Unicode pair', '\ud800\udc00'],
  ['replacement character', '\ufffd'],
  ['ordinary Unicode', '\ufeffé\t\n'],
]) test('selected text preserves ' + name + ' and its UTF-8 bytes', async () => {
  const files = new Map([['metadata.json', text]])
  const snapshot = snapshotFiles(files)
  assert.equal(snapshot.get('metadata.json'), text)
  for (const value of [text, new TextEncoder().encode(text), new Blob([text])])
    assert.equal(await createWorkspace(new Map([['metadata.json', value]])).readText('metadata.json'), text)
})

test('selected text uses the captured well-formedness intrinsic', () => {
  const original = String.prototype.isWellFormed
  try {
    String.prototype.isWellFormed = () => true
    assert.throws(() => snapshotFiles(new Map([['metadata.json', '\ud800']])), /unpaired Unicode surrogate/)
  } finally {String.prototype.isWellFormed = original}
})
