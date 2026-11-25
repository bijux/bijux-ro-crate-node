import type { Pool } from 'pg';
import { admitRecovery, RECOVERY_REQUEST_MAX_BYTES } from '../recovery/admission.js';

interface Owner { issuer: string; subject: string }
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function handleDraftRequest(request: Request, url: URL, origin: URL, database: Pool, owner: Owner): Promise<Response> {
  if (request.method === 'GET' && url.pathname === '/api/local/drafts') {
    const result = await database.query<{ draft_id: string; version_id: string; saved_at: Date }>(
      `SELECT d.id AS draft_id, v.id AS version_id, v.created_at AS saved_at
       FROM draft_store.drafts d JOIN draft_store.versions v ON v.id = d.head_id
       WHERE d.issuer = $1 AND d.subject = $2 ORDER BY v.created_at DESC LIMIT 100`, [owner.issuer, owner.subject]);
    return Response.json({ drafts: result.rows.map(row => ({ draftId: row.draft_id, versionId: row.version_id, savedAt: row.saved_at.toISOString() })) });
  }
  if (request.method === 'POST' && url.pathname === '/api/local/drafts') {
    if (request.headers.get('origin') !== origin.origin) return new Response(null, { status: 403 });
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return new Response(null, { status: 415 });
    const length = request.headers.get('content-length');
    if (length !== null && Number(length) > RECOVERY_REQUEST_MAX_BYTES) return new Response(null, { status: 413 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = request.body?.getReader();
    if (reader) {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > RECOVERY_REQUEST_MAX_BYTES) { void reader.cancel(); return new Response(null, { status: 413 }); }
        chunks.push(value);
      }
    }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { return new Response(null, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return new Response(null, { status: 400 });
    const item = body as Record<string, unknown>;
    if (Object.keys(item).some(key => !['key', 'draftId', 'expectedHead', 'recovery'].includes(key)) ||
        typeof item.key !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(item.key) ||
        (item.draftId !== undefined && !uuid(item.draftId)) ||
        (item.expectedHead !== undefined && !uuid(item.expectedHead)) ||
        ((item.draftId === undefined) !== (item.expectedHead === undefined))) return new Response(null, { status: 400 });
    const admitted = await admitRecovery(item.recovery);
    if (!admitted) return new Response(null, { status: 400 });
    try {
      const result = await database.query<{ draft_id: string; version_id: string; content_hash: string }>(
        'SELECT * FROM draft_store.save($1, $2, $3, $4, $5, $6, $7::jsonb)',
        [owner.issuer, owner.subject, item.draftId ?? null, item.expectedHead ?? null, item.key, admitted.payload, JSON.stringify(admitted.frozen)]);
      const saved = result.rows[0];
      const timestamp = await database.query<{ saved_at: string }>(
        `SELECT to_char(v.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS saved_at
         FROM draft_store.versions v JOIN draft_store.drafts d ON d.id = v.draft_id
         WHERE v.id = $1 AND d.id = $2 AND d.issuer = $3 AND d.subject = $4`,
        [saved.version_id, saved.draft_id, owner.issuer, owner.subject]);
      if (!timestamp.rowCount) return new Response(null, { status: 500 });
      return Response.json({ draftId: saved.draft_id, versionId: saved.version_id, contentHash: saved.content_hash, savedAt: timestamp.rows[0].saved_at }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      return new Response(null, { status: message === 'draft unavailable' ? 404 : ['head conflict', 'idempotency conflict'].includes(message) ? 409 : 500 });
    }
  }
  const history = /^\/api\/local\/drafts\/([0-9a-f-]{36})\/versions(?:\/([0-9a-f-]{36})(?:\/(backup|files))?)?$/i.exec(url.pathname);
  if (request.method === 'GET' && history && uuid(history[1]) && (!history[2] || uuid(history[2]))) {
    if (!history[2]) {
      const draft = await database.query('SELECT 1 FROM draft_store.drafts WHERE id = $1 AND issuer = $2 AND subject = $3', [history[1], owner.issuer, owner.subject]);
      if (!draft.rowCount) return new Response(null, { status: 404 });
      const versions = await database.query<{ id: string; created_at: Date }>('SELECT id, created_at FROM draft_store.versions WHERE draft_id = $1 ORDER BY created_at DESC, id DESC', [history[1]]);
      return Response.json({ versions: versions.rows.map(row => ({ versionId: row.id, savedAt: row.created_at.toISOString() })) });
    }
    const result = await database.query<{ id: string; payload: string; frozen: unknown; content_hash: string; created_at: Date }>(
      `SELECT v.id, v.payload, v.frozen, v.content_hash, v.created_at FROM draft_store.drafts d JOIN draft_store.versions v ON v.draft_id = d.id
       WHERE d.id = $1 AND d.issuer = $2 AND d.subject = $3 AND v.id = $4`, [history[1], owner.issuer, owner.subject, history[2]]);
    if (!result.rowCount) return new Response(null, { status: 404 });
    const version = result.rows[0];
    if (history[3] === 'backup') return new Response(version.payload, { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="draft-backup.json"' } });
    if (history[3] === 'files') return Response.json(version.frozen);
    return Response.json({ versionId: version.id, savedAt: version.created_at.toISOString(), contentHash: version.content_hash, recovery: JSON.parse(version.payload), frozen: version.frozen });
  }
  const restore = /^\/api\/local\/drafts\/([0-9a-f-]{36})\/restore$/i.exec(url.pathname);
  if (request.method === 'POST' && restore && uuid(restore[1])) {
    if (request.headers.get('origin') !== origin.origin) return new Response(null, { status: 403 });
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return new Response(null, { status: 415 });
    let body: unknown;
    try {
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1024) { void reader.cancel(); return new Response(null, { status: 413 }); }
        chunks.push(value);
      }
      body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    }
    catch { return new Response(null, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return new Response(null, { status: 400 });
    const item = body as Record<string, unknown>;
    if (Object.keys(item).some(key => !['key', 'expectedHead', 'sourceVersion'].includes(key)) ||
        typeof item.key !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(item.key) || !uuid(item.expectedHead) || !uuid(item.sourceVersion)) return new Response(null, { status: 400 });
    try {
      const result = await database.query<{ draft_id: string; version_id: string; content_hash: string }>('SELECT * FROM draft_store.restore($1,$2,$3,$4,$5,$6)', [owner.issuer, owner.subject, restore[1], item.expectedHead, item.key, item.sourceVersion]);
      const saved = result.rows[0];
      return Response.json({ draftId: saved.draft_id, versionId: saved.version_id, contentHash: saved.content_hash }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      return new Response(null, { status: message === 'draft unavailable' ? 404 : ['head conflict', 'idempotency conflict'].includes(message) ? 409 : 500 });
    }
  }
  const match = /^\/api\/local\/drafts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(url.pathname);
  if (request.method === 'GET' && match) {
    const result = await database.query<{ id: string; payload: string; frozen: unknown; content_hash: string; saved_at: string }>(
      `SELECT v.id, v.payload, v.frozen, v.content_hash, to_char(v.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS saved_at FROM draft_store.drafts d JOIN draft_store.versions v ON v.id = d.head_id
       WHERE d.id = $1 AND d.issuer = $2 AND d.subject = $3`, [match[1], owner.issuer, owner.subject]);
    if (!result.rowCount) return new Response(null, { status: 404 });
    const version = result.rows[0];
    return Response.json({ versionId: version.id, contentHash: version.content_hash, savedAt: version.saved_at, recovery: JSON.parse(version.payload), frozen: version.frozen });
  }
  return new Response(null, { status: 404 });
}
