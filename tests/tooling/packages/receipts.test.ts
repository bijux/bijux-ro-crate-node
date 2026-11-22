import assert from 'node:assert/strict'
import test from 'node:test'
import {parseJson, packageRecords, packageLockField, packedFilename, snapshotReceipt, nodeReceipt, nativeReceipt, numericReceipt, lifecycleReceipt, withoutRootName} from '../../package/harness/receipts.mjs'

test('package receipts reject malformed fields before qualification', () => {
  const packageRecord = {version: '1.0.0', dependencies: {}, name: 42, directory: 'core', archive: 'core.tgz', sha256: 'abc', integrity: 'sha512-x', files: ['package.json']}
  assert.throws(() => packageRecords([packageRecord]), /Expected string field: name/)
  assert.throws(() => packageLockField(parseJson('{"packages":{"x":{"integrity":3}}}'), 'x', 'integrity'))
  assert.throws(() => packedFilename(parseJson('[{"filename":null}]')))
  const identity = {node_version: '22.23.4', distribution: 'installed', imported_module: 'file:///installed.js'}
  const snapshot = {...identity, reference_kind: 'qualified-main', corpus_sha256: 'abc', failed: 0, passed: 4, total: '4',
    qualified_collection_cases: 1, qualified_collection_passed: 1, ordinary_exact_cases: 3, ordinary_exact_passed: 3}
  assert.throws(() => snapshotReceipt(snapshot), /Expected number field: total/)
  assert.throws(() => nodeReceipt({...identity, cases: '4', approved_differences: 0}), /Expected number field: cases/)
  assert.throws(() => nativeReceipt(parseJson('{"node":"22","passed":"4"}')))
  assert.throws(() => numericReceipt({...identity, cases: 11, platform_dependent: '3'}), /Expected number field: platform_dependent/)
  assert.throws(() => lifecycleReceipt(parseJson('{"corePath":null}')))
  assert.throws(() => withoutRootName('{"@graph":[]}'))
})

test('package manifest preserves extra receipt evidence', () => {
  const [item] = packageRecords(parseJson('[{"name":"x","version":"1.0.0","dependencies":{},"directory":"core","archive":"x.tgz","sha256":"abc","integrity":"sha512-x","files":["package.json"],"extra":1}]'))
  assert.deepEqual(item, {name: 'x', version: '1.0.0', dependencies: {}, directory: 'core', archive: 'x.tgz', sha256: 'abc', integrity: 'sha512-x', files: ['package.json'], extra: 1})
})
