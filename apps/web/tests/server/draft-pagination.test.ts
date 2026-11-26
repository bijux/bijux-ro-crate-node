import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import {migrateDatabase} from '../../src/server/database/migrations.js'
import {handleDraftRequest} from '../../src/server/drafts/http.js'

test('draft pages cover tied timestamps without crossing account boundaries', async () => {
  const address = new URL(process.env.DRAFT_PAGINATION_DATABASE_URL ?? 'postgresql://authoring:local-reference-only@127.0.0.1:15433/authoring')
  assert.equal(address.protocol, 'postgresql:')
  assert.equal(address.hostname, '127.0.0.1')
  assert.equal(address.username, 'authoring')
  assert.equal(address.password, 'local-reference-only')
  assert.equal(address.pathname, '/authoring')
  assert.ok(address.port && !address.search && !address.hash)
  const pool = new pg.Pool({connectionString:address.href, max:1})
  const owner = {issuer:`fixture-${randomUUID()}`, subject:'alice'}, other = {...owner, subject:'bob'}
  const origin = new URL('http://127.0.0.1:14321')
  const call = (query:string, principal = owner) => {
    const url = new URL('/api/local/drafts' + query, origin)
    return handleDraftRequest(new Request(url), url, origin, pool, principal)
  }
  try {
    await migrateDatabase(pool)
    await pool.query('BEGIN')
    await pool.query('INSERT INTO draft_store.drafts (issuer, subject) SELECT $1, $2 FROM generate_series(1, 103)', [owner.issuer, owner.subject])
    await pool.query("INSERT INTO draft_store.versions (draft_id,payload,frozen,content_hash,created_at) SELECT id, '{}', '{}'::jsonb, 'fixture', '2025-01-01T00:00:00.123456Z' FROM draft_store.drafts WHERE issuer=$1 AND subject=$2", [owner.issuer, owner.subject])
    await pool.query('UPDATE draft_store.drafts d SET head_id=v.id FROM draft_store.versions v WHERE v.draft_id=d.id AND d.issuer=$1 AND d.subject=$2', [owner.issuer, owner.subject])
    const first = await (await call('')).json() as {drafts:Array<{draftId:string}>, nextCursor:string|null}
    assert.equal(first.drafts.length, 100)
    assert.ok(first.nextCursor)
    const newer = await pool.query<{id:string; draft_id:string}>("INSERT INTO draft_store.versions (draft_id,payload,frozen,content_hash,created_at) SELECT draft_id, '{}', '{}'::jsonb, 'fixture', '2025-01-02T00:00:00Z' FROM draft_store.versions WHERE id=$1 RETURNING id,draft_id", [first.nextCursor])
    await pool.query('UPDATE draft_store.drafts SET head_id=$1 WHERE id=$2', [newer.rows[0].id, newer.rows[0].draft_id])
    const second = await (await call(`?before=${first.nextCursor}`)).json() as typeof first
    assert.equal(second.drafts.length, 3)
    assert.equal(second.nextCursor, null)
    assert.equal(new Set([...first.drafts, ...second.drafts].map(draft => draft.draftId)).size, 103)
    assert.equal((await call(`?before=${first.nextCursor}`, other)).status, 404)
    assert.equal((await call('?before=invalid')).status, 400)
    assert.equal((await call(`?before=${first.nextCursor}&before=${first.nextCursor}`)).status, 400)
    assert.equal((await call('?other=value')).status, 400)
  } finally {
    await pool.query('ROLLBACK')
    await pool.end()
  }
})
