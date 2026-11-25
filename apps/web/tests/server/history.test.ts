import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import pg from 'pg';
import { migrateDatabase } from '../../src/server/database/migrations.js';
import { handleDraftRequest } from '../../src/server/drafts/http.js';

const databaseUrl = process.env.HISTORY_DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== '/history') throw Error('HISTORY_DATABASE_URL must identify a dedicated history test database');
const pool = new pg.Pool({ connectionString: databaseUrl });
const origin = new URL('http://127.0.0.1:14322');
const alice = { issuer: 'issuer', subject: 'alice' };
const bob = { issuer: 'issuer', subject: 'bob' };
const call = (path: string, owner = alice, body?: unknown) => handleDraftRequest(new Request(new URL(path, origin), body === undefined ? {} : { method: 'POST', headers: { origin: origin.origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }), new URL(path, origin), origin, pool, owner);

test('history preserves bytes, owner isolation and restore request identity', async () => {
  try {
    await pool.query('DROP SCHEMA IF EXISTS draft_store CASCADE; DROP SCHEMA IF EXISTS draft_identity CASCADE; DROP SCHEMA IF EXISTS draft_migrations CASCADE');
    await migrateDatabase(pool);
    await migrateDatabase(pool);
    const save = async (draft: string | null, head: string | null, key: string, payload: string, frozen: object) => (await pool.query('select * from draft_store.save($1,$2,$3,$4,$5,$6,$7)', ['issuer', 'alice', draft, head, key, payload, JSON.stringify(frozen)])).rows[0];
    const frozen = { status: 'materialized', revision: 1, files: [{ path: 'ro-crate-metadata.json', base64: 'b2xk' }] };
    const first = await save(null, null, 'first', '{"old":true}', frozen);
    const second = await save(first.draft_id, first.version_id, 'second', '{"old":true}', { ...frozen, files: [{ path: 'ro-crate-metadata.json', base64: 'bmV3' }] });
    const base = `/api/local/drafts/${first.draft_id}`;
    assert.equal((await call(`${base}/versions`, bob)).status, 404);
    assert.equal((await call(`${base}/versions/${first.version_id}`, bob)).status, 404);
    assert.equal((await call(`${base}/restore`, bob, { key: 'stolen', expectedHead: second.version_id, sourceVersion: first.version_id })).status, 404);
    const history = await (await call(`${base}/versions`)).json() as { versions: Array<{versionId: string}> };
    assert.equal(history.versions.length, 2);
    const old = await (await call(`${base}/versions/${first.version_id}`)).json() as { frozen: typeof frozen };
    assert.deepEqual(old.frozen, frozen);
    assert.equal(await (await call(`${base}/versions/${first.version_id}/backup`)).text(), JSON.stringify({old:true}));
    assert.deepEqual(await (await call(`${base}/versions/${first.version_id}/files`)).json(), frozen);
    assert.equal((await call(`${base}/versions/${first.version_id}/backup`, bob)).status, 404);
    assert.equal((await call(`${base}/versions/${first.version_id}/files`, bob)).status, 404);
    const request = { key: 'restore', expectedHead: second.version_id, sourceVersion: first.version_id };
    const restored = await call(`${base}/restore`, alice, request);
    assert.equal(restored.status, 201);
    const result = await restored.json() as { versionId: string };
    assert.notEqual(result.versionId, first.version_id);
    assert.deepEqual(await (await call(`${base}/restore`, alice, request)).json(), result);
    assert.equal((await call(`${base}/restore`, alice, { ...request, sourceVersion: second.version_id })).status, 409);
    assert.equal((await call(`${base}/restore`, alice, { ...request, key: 'stale' })).status, 409);
    await assert.rejects(save(first.draft_id, second.version_id, 'restore', '{\"old\":true}', frozen), /idempotency conflict/);
    assert.equal((await call(`${base}/restore`, alice, { ...request, key: 'second' })).status, 409);
    const competing = await Promise.all(['left', 'right'].map(key => call(`${base}/restore`, alice, { key, expectedHead: result.versionId, sourceVersion: first.version_id })));
    assert.deepEqual(competing.map(response => response.status).sort(), [201, 409]);
    assert.deepEqual((await (await call(`${base}/versions/${first.version_id}`)).json() as { frozen: typeof frozen }).frozen, frozen);
    assert.deepEqual((await (await call(`${base}/versions/${result.versionId}`)).json() as { frozen: typeof frozen }).frozen, frozen);
  } finally { await pool.end(); }
});
