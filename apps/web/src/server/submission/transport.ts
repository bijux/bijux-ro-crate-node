import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { markDispatch, recordObservation, type SubmissionRecord } from './store.js';

/** Only an explicitly configured, credential-free loopback receiver may be contacted. */
export async function dispatchSubmission(pool:Pool, record:SubmissionRecord, destination:string):Promise<SubmissionRecord> {
  const url = new URL(destination);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw Error('Receiver requires a strict loopback origin');
  if (record.state === 'rejected') return record;
  await markDispatch(pool,record.operationId);
  try {
    const accepted = record.state === 'accepted';
    const response = await fetch(new URL(accepted ? `/creates/${record.operationId}` : '/creates',url), {method:accepted ? 'GET' : 'POST', ...(accepted ? {} : {headers:{'content-type':'application/json'}, body:record.payload}), signal:AbortSignal.timeout(3000), redirect:'error'});
    if (response.status !== (accepted ? 200 : 201) || response.headers.get('content-type')?.split(';')[0] !== 'application/json') return recordObservation(pool,record.operationId,null);
    const body:unknown = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return recordObservation(pool,record.operationId,null);
    const value = body as Record<string,unknown>;
    const expected = createHash('sha256').update(record.payload).digest('hex');
    if (Object.keys(value).sort().join(',') !== 'payloadHash,receiptId,status' || value.status !== 'local-reference-accepted' || value.payloadHash !== expected || typeof value.receiptId !== 'string' || !/^local-reference-[0-9a-f-]{36}$/.test(value.receiptId)) return recordObservation(pool,record.operationId,null);
    return recordObservation(pool,record.operationId,value.receiptId);
  } catch { return recordObservation(pool,record.operationId,null); }
}
