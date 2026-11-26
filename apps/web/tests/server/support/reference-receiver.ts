import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { Pool } from 'pg';

/** Independent local protocol fixture. Its records are never archive accessions. */
export async function startReferenceReceiver(pool: Pool, port = 0, options:{loseFirstResponse?:boolean} = {}): Promise<{origin:string; close():Promise<void>}> {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS reference_receiver;
    CREATE TABLE IF NOT EXISTS reference_receiver.receipts (
      operation_key text PRIMARY KEY, payload_hash text NOT NULL, receipt_id text NOT NULL UNIQUE
    )`);
  let loseResponse = options.loseFirstResponse === true;
  const server = createServer((request, response) => {
    void (async () => {
      const send = (status:number, value?:unknown) => { response.writeHead(status, {'content-type':'application/json'}); response.end(value === undefined ? '' : JSON.stringify(value)); };
      const path = request.url ?? '';
      if (request.method === 'GET' && /^\/creates\/[A-Za-z0-9-]{1,128}$/.test(path)) {
        const found = await pool.query<{receipt_id:string; payload_hash:string}>('SELECT receipt_id, payload_hash FROM reference_receiver.receipts WHERE operation_key = $1', [path.slice('/creates/'.length)]);
        const row = found.rows[0];
        send(row ? 200 : 404, row && {status:'local-reference-accepted', receiptId:row.receipt_id, payloadHash:row.payload_hash});
        return;
      }
      if (request.method !== 'POST' || path !== '/creates' || request.headers['content-type'] !== 'application/json') { send(404); return; }
      const chunks:Buffer[] = []; let size = 0;
      for await (const chunk of request) { const bytes = Buffer.from(chunk as Uint8Array); size += bytes.length; if (size > 10_000_000) { send(413); return; } chunks.push(bytes); }
      const raw = Buffer.concat(chunks);
      let body:unknown;
      try { body = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(raw)); } catch { send(400); return; }
      if (!body || typeof body !== 'object' || Array.isArray(body)) { send(400); return; }
      const value = body as Record<string, unknown>;
      if (Object.keys(value).sort().join(',') !== 'files,operationKey' || typeof value.operationKey !== 'string' || !/^[A-Za-z0-9-]{1,128}$/.test(value.operationKey) || !Array.isArray(value.files) || value.files.length === 0 || value.files.length > 1000) { send(400); return; }
      const paths = new Set<string>();
      for (const entry of value.files) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).sort().join(',') !== 'base64,path' || typeof entry.path !== 'string' || !entry.path || paths.has(entry.path) || typeof entry.base64 !== 'string' || Buffer.from(entry.base64, 'base64').toString('base64') !== entry.base64) { send(400); return; }
        paths.add(entry.path);
      }
      const hash = createHash('sha256').update(raw).digest('hex');
      await pool.query('INSERT INTO reference_receiver.receipts VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [value.operationKey, hash, `local-reference-${randomUUID()}`]);
      const row = (await pool.query<{receipt_id:string; payload_hash:string}>('SELECT receipt_id,payload_hash FROM reference_receiver.receipts WHERE operation_key=$1', [value.operationKey])).rows[0];
      if (row.payload_hash !== hash) { send(409); return; }
      if (loseResponse) { loseResponse = false; response.destroy(); return; }
      send(201, {status:'local-reference-accepted', receiptId:row.receipt_id, payloadHash:row.payload_hash});
    })().catch(() => { if (!response.headersSent) response.writeHead(500); response.end(); });
  });
  server.listen(port, '127.0.0.1'); await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Receiver did not bind loopback');
  return {origin:`http://127.0.0.1:${address.port}`, close:() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))};
}
