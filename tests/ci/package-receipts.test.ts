import assert from 'node:assert/strict'
import test from 'node:test'
import {parseJson, packageRecords, packageLockField, packedFilename, snapshotReceipt, nodeReceipt, nativeReceipt, numericReceipt, lifecycleReceipt, withoutRootName} from '../package/receipts.mjs'

test('package receipts reject malformed fields before qualification', () => {
  assert.throws(() => packageRecords(parseJson('[{"name":42}]')))
  assert.throws(() => packageLockField(parseJson('{"packages":{"x":{"integrity":3}}}'), 'x', 'integrity'))
  assert.throws(() => packedFilename(parseJson('[{"filename":null}]')))
  assert.throws(() => snapshotReceipt(parseJson('{"total":"4"}')))
  assert.throws(() => nodeReceipt(parseJson('{"cases":4}')))
  assert.throws(() => nativeReceipt(parseJson('{"node":"22","passed":"4"}')))
  assert.throws(() => numericReceipt(parseJson('{"cases":11}')))
  assert.throws(() => lifecycleReceipt(parseJson('{"corePath":null}')))
  assert.throws(() => withoutRootName('{"@graph":[]}'))
})

test('package manifest preserves extra receipt evidence', () => {
  const [item] = packageRecords(parseJson('[{"name":"x","directory":"core","archive":"x.tgz","sha256":"abc","integrity":"sha512-x","files":["package.json"],"extra":1}]'))
  assert.deepEqual(item, {name: 'x', directory: 'core', archive: 'x.tgz', sha256: 'abc', integrity: 'sha512-x', files: ['package.json'], extra: 1})
})
