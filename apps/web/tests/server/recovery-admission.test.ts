import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { applyChange, createDraft, importCrate } from '@bijux/ro-crate-creator';
import { encodeRecovery, RECOVERY_MAX_BYTES } from '../../src/drafts/recovery-codec.js';
import { admitRecovery, RECOVERY_REQUEST_MAX_BYTES } from '../../src/server/recovery/admission.js';

test('real recovery data retains pending input and server-derived materialization', async () => {
  const created = applyChange(createDraft(), { type: 'add-study' });
  assert.equal(created.status, 'applied');
  if (created.status !== 'applied') throw Error('setup');
  const recovery = JSON.parse(encodeRecovery({ draft: created.draft, pending: [{ id: 'p:1', path: 'image.tif', size: '900719925474099312345' }] }));
  const admitted = await admitRecovery(recovery);
  assert.ok(admitted);
  assert.equal(admitted.frozen.status, 'blocked');
  if (admitted.frozen.status !== 'blocked') throw Error('expected pending input to block materialization');
  assert.ok(admitted.frozen.issues.some(issue => issue.code === 'pending-file-listings'));
  const ready = await admitRecovery(JSON.parse(encodeRecovery({ draft: created.draft, pending: [] })));
  assert.equal(ready?.frozen.status, 'materialized');
  assert.deepEqual(JSON.parse(admitted.payload), recovery);
  assert.ok(RECOVERY_REQUEST_MAX_BYTES > RECOVERY_MAX_BYTES);
});

test('unfinished vocabulary survives admission and blocks frozen files', async () => {
  const created = applyChange(createDraft(), {type:'add-study'});
  if (created.status !== 'applied') throw Error('study setup');
  const sample = applyChange(created.draft, {type:'add-entity', kind:'biosample'});
  if (sample.status !== 'applied') throw Error('biosample setup');
  const term = {kind:'taxonomy' as const, entityId:sample.entityId, previousId:null, identifier:'NCBITaxon:', label:'unfinished'};
  const recovery = JSON.parse(encodeRecovery({draft:sample.draft, pending:[], pendingTerms:[term]}));
  const admitted = await admitRecovery(recovery);
  assert.ok(admitted);
  assert.deepEqual(JSON.parse(admitted.payload), recovery);
  assert.equal(admitted.frozen.status, 'blocked');
});

test('incomplete and read-only recoveries preserve their distinct status and admitted bytes', async () => {
  const blocked = await admitRecovery(JSON.parse(encodeRecovery({ draft: createDraft(), pending: [] })));
  assert.equal(blocked?.frozen.status, 'blocked');
  const selected = await importCrate(new Map([['ro-crate-metadata.json', new Uint8Array([255])]]), { metadataPaths: ['ro-crate-metadata.json'] });
  assert.equal(selected.status, 'read-only');
  if (selected.status !== 'read-only') throw Error('setup');
  const recovered = await admitRecovery(JSON.parse(encodeRecovery({ readOnly: selected, pending: [] })));
  assert.equal(recovered?.frozen.status, 'read-only');
  if (recovered?.frozen.status !== 'read-only') throw Error('expected read-only');
  assert.equal(recovered.frozen.files[0].base64, '/w==');
});

test('recovery excludes a separate payload attached to pending input', async () => {
  const value = JSON.parse(encodeRecovery({ draft: createDraft(), pending: [{ id: 'p:1', path: 'image.tif', size: '1' }] }));
  value.pending[0].payload = 'eA==';
  assert.equal(await admitRecovery(value), undefined);
});

test('admitted auxiliary metadata and opaque scientific fields survive freezing', async () => {
  const descriptor = '{"@context":["https://w3id.org/ro/crate/1.1/context",{"bia":"http://bia/"}],"@graph":[{"@id":"ro-crate-metadata.json","@type":"CreativeWork","conformsTo":{"@id":"https://w3id.org/ro/crate/1.1"},"about":{"@id":"./"}},{"@id":"./","@type":["Dataset","bia:Study"],"unknown":{"@id":"#entity-1"}},{"@id":"#entity-1","@type":"bia:Unknown","value":"kept"}]}';
  const imported = await importCrate(new Map([['ro-crate-metadata.json', descriptor], ['notes.txt', 'preserve me'], ['image.tif', 'payload']]), { metadataPaths: ['ro-crate-metadata.json', 'notes.txt'] });
  assert.equal(imported.status, 'editable');
  if (imported.status !== 'editable') throw Error('setup');
  const result = await admitRecovery(JSON.parse(encodeRecovery({ draft: imported.draft, pending: [] })));
  assert.equal(result?.frozen.status, 'materialized');
  if (result?.frozen.status !== 'materialized') throw Error('expected materialization');
  const files = new Map(result.frozen.files.map(file => [file.path, Buffer.from(file.base64, 'base64').toString('utf8')]));
  assert.equal(files.get('ro-crate-metadata.json'), descriptor);
  assert.equal(files.get('notes.txt'), 'preserve me');
  assert.equal(files.has('image.tif'), false);
});
