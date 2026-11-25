import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { admitRecovery, RECOVERY_REQUEST_MAX_BYTES } from '../recovery/admission.js';

interface DraftRequest {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  origin: URL;
  database: Pool;
  owner: { issuer: string; subject: string };
}

export async function handleDraftRequest({ request, response, url, origin, database, owner }: DraftRequest): Promise<void> {
  if (request.method === 'POST' && url.pathname === '/drafts') {
    if (request.headers.origin !== origin.origin) { response.writeHead(403).end(); return; }
    if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') { response.writeHead(415).end(); return; }
    const length = request.headers['content-length'];
    if (length !== undefined && Number(length) > RECOVERY_REQUEST_MAX_BYTES) { response.writeHead(413).end(); request.resume(); return; }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const bytes = Buffer.from(chunk as Uint8Array);
      size += bytes.length;
      if (size > RECOVERY_REQUEST_MAX_BYTES) { response.writeHead(413).end(); request.resume(); return; }
      chunks.push(bytes);
    }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch { response.writeHead(400).end(); return; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) { response.writeHead(400).end(); return; }
    const item = body as Record<string, unknown>;
    const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    if (Object.keys(item).some(key => !['key', 'draftId', 'expectedHead', 'recovery'].includes(key)) ||
        typeof item.key !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(item.key) ||
        (item.draftId !== undefined && !uuid(item.draftId)) ||
        (item.expectedHead !== undefined && !uuid(item.expectedHead)) ||
        ((item.draftId === undefined) !== (item.expectedHead === undefined))) { response.writeHead(400).end(); return; }
    const admitted = await admitRecovery(item.recovery);
    if (!admitted) { response.writeHead(400).end(); return; }
    try {
      const result = await database.query<{ draft_id: string; version_id: string; content_hash: string }>(
        'SELECT * FROM draft_store.save($1, $2, $3, $4, $5, $6, $7::jsonb)',
        [owner.issuer, owner.subject, item.draftId ?? null, item.expectedHead ?? null, item.key, admitted.payload, JSON.stringify(admitted.frozen)]);
      const saved = result.rows[0];
      response.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({ draftId: saved.draft_id, versionId: saved.version_id, contentHash: saved.content_hash }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      response.writeHead(message === 'draft unavailable' ? 404 : ['head conflict', 'idempotency conflict'].includes(message) ? 409 : 500).end();
    }
    return;
  }
  const match = /^\/drafts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(url.pathname);
  if (request.method === 'GET' && match) {
    const result = await database.query<{ id: string; payload: string; frozen: unknown; content_hash: string }>(
      `SELECT v.id, v.payload, v.frozen, v.content_hash FROM draft_store.drafts d JOIN draft_store.versions v ON v.id = d.head_id
       WHERE d.id = $1 AND d.issuer = $2 AND d.subject = $3`, [match[1], owner.issuer, owner.subject]);
    if (!result.rowCount) { response.writeHead(404).end(); return; }
    const version = result.rows[0];
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ versionId: version.id, contentHash: version.content_hash, recovery: JSON.parse(version.payload), frozen: version.frozen }));
    return;
  }
  response.writeHead(404).end(); return;
}
