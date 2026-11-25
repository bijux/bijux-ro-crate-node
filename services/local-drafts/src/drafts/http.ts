import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';

export type DraftValidator = (input: unknown) => string | undefined;

interface DraftRequest {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  origin: URL;
  database: Pool;
  owner: { issuer: string; subject: string };
  validateDraft: DraftValidator;
}

export async function handleDraftRequest({ request, response, url, origin, database, owner, validateDraft }: DraftRequest): Promise<void> {
  if (request.method === 'POST' && url.pathname === '/drafts') {
    if (request.headers.origin !== origin.origin) { response.writeHead(403).end(); return; }
    if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') { response.writeHead(415).end(); return; }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const bytes = Buffer.from(chunk as Uint8Array);
      size += bytes.length;
      if (size > 1048576) { response.writeHead(413).end(); request.resume(); return; }
      chunks.push(bytes);
    }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { response.writeHead(400).end(); return; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) { response.writeHead(400).end(); return; }
    const item = body as Record<string, unknown>;
    const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    if (typeof item.key !== 'string' || item.key.length < 1 || item.key.length > 128 ||
        (item.draftId !== undefined && !uuid(item.draftId)) ||
        (item.expectedHead !== undefined && !uuid(item.expectedHead)) ||
        ((item.draftId === undefined) !== (item.expectedHead === undefined))) { response.writeHead(400).end(); return; }
    let payload: string | undefined;
    try { payload = validateDraft(item.payload); if (payload !== undefined) JSON.parse(payload); }
    catch { response.writeHead(400).end(); return; }
    if (payload === undefined || Buffer.byteLength(payload) > 1048576) { response.writeHead(400).end(); return; }
    try {
      const result = await database.query<{ draft_id: string; version_id: string; content_hash: string }>(
        'SELECT * FROM draft_store.save($1, $2, $3, $4, $5, $6)',
        [owner.issuer, owner.subject, item.draftId ?? null, item.expectedHead ?? null, item.key, payload]);
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
    const result = await database.query<{ id: string; payload: string; content_hash: string }>(
      `SELECT v.id, v.payload, v.content_hash FROM draft_store.drafts d JOIN draft_store.versions v ON v.id = d.head_id
       WHERE d.id = $1 AND d.issuer = $2 AND d.subject = $3`, [match[1], owner.issuer, owner.subject]);
    if (!result.rowCount) { response.writeHead(404).end(); return; }
    const version = result.rows[0];
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ versionId: version.id, contentHash: version.content_hash, payload: JSON.parse(version.payload) }));
    return;
  }
  response.writeHead(404).end(); return;
}
