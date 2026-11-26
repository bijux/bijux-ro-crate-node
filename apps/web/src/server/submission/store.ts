import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface SubmissionClaim {
  owner:{issuer:string; subject:string}; draftId:string; versionId:string; contentHash:string;
  qualificationDigest:string; requestKey:string; files:readonly {path:string; base64:string}[];
}
export interface SubmissionRecord {
  operationId:string; versionId:string; contentHash:string; qualificationDigest:string; payload:string;
  state:'prepared'|'uncertain'|'accepted'|'rejected'; receiptId:string|null; preparedAt:Date; lastObservedAt:Date|null;
  observation:'none'|'available'|'unavailable'; reason:string|null;
}
const projection = `operation_id AS "operationId", version_id AS "versionId", content_hash AS "contentHash", qualification_digest AS "qualificationDigest", payload, state, receipt_id AS "receiptId", prepared_at AS "preparedAt", last_observed_at AS "lastObservedAt", observation, reason`;

export const LOCAL_RECEIVER_MAX_BODY_BYTES = 24_000_000;

/** Serializes claim creation per draft. The receiver key and exact body never change. */
export async function claimSubmission(pool:Pool, input:SubmissionClaim):Promise<SubmissionRecord> {
  const envelope = JSON.stringify({operationKey:'00000000-0000-0000-0000-000000000000', files:input.files});
  if (Buffer.byteLength(envelope, 'utf8') > LOCAL_RECEIVER_MAX_BODY_BYTES) throw Error('payload too large');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1 || chr(31) || $2, 0))", [input.owner.issuer,input.owner.subject]);
    const owned = await client.query(`SELECT v.id FROM draft_store.drafts d JOIN draft_store.versions v ON v.draft_id=d.id
      WHERE d.id=$1 AND d.issuer=$2 AND d.subject=$3 AND v.id=$4 AND v.content_hash=$5 FOR UPDATE OF d`,
      [input.draftId,input.owner.issuer,input.owner.subject,input.versionId,input.contentHash]);
    if (!owned.rowCount) throw Error('draft unavailable');
    const found = await client.query<SubmissionRecord>(`SELECT ${projection} FROM draft_store.submissions WHERE draft_id=$1`, [input.draftId]);
    let record = found.rows[0];
    if (record) {
      const expected = JSON.stringify({operationKey:record.operationId, files:input.files});
      if (record.versionId !== input.versionId || record.contentHash !== input.contentHash || record.qualificationDigest !== input.qualificationDigest || record.payload !== expected) throw Error('submission conflict');
    } else {
      const operationId = randomUUID();
      const payload = JSON.stringify({operationKey:operationId, files:input.files});
      record = (await client.query<SubmissionRecord>(`INSERT INTO draft_store.submissions (operation_id,draft_id,version_id,content_hash,qualification_digest,payload) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${projection}`,
        [operationId,input.draftId,input.versionId,input.contentHash,input.qualificationDigest,payload])).rows[0];
    }
    const previous = await client.query<{operation_id:string}>('SELECT operation_id FROM draft_store.submission_requests WHERE issuer=$1 AND subject=$2 AND request_key=$3', [input.owner.issuer,input.owner.subject,input.requestKey]);
    if (previous.rowCount && previous.rows[0].operation_id !== record.operationId) throw Error('submission conflict');
    if (!previous.rowCount) await client.query('INSERT INTO draft_store.submission_requests VALUES ($1,$2,$3,$4)', [input.owner.issuer,input.owner.subject,input.requestKey,record.operationId]);
    await client.query('COMMIT');
    return record;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function markDispatch(pool:Pool, operationId:string):Promise<void> {
  await pool.query("UPDATE draft_store.submissions SET state='uncertain', reason='Receiver outcome is unknown' WHERE operation_id=$1 AND state='prepared'", [operationId]);
}
export async function recordObservation(pool:Pool, operationId:string, receiptId:string|null):Promise<SubmissionRecord> {
  const result = await pool.query<SubmissionRecord>(`UPDATE draft_store.submissions SET
    state=CASE WHEN $2::text IS NOT NULL AND (receipt_id IS NULL OR receipt_id=$2) THEN 'accepted' ELSE state END,
    receipt_id=COALESCE(receipt_id,$2), observation=CASE WHEN $2::text IS NOT NULL AND (receipt_id IS NULL OR receipt_id=$2) THEN 'available' ELSE 'unavailable' END,
    last_observed_at=CASE WHEN $2::text IS NOT NULL AND (receipt_id IS NULL OR receipt_id=$2) THEN now() ELSE last_observed_at END,
    reason=CASE WHEN $2::text IS NOT NULL AND (receipt_id IS NULL OR receipt_id=$2) THEN NULL WHEN state='accepted' THEN reason ELSE 'Receiver outcome is unknown' END
    WHERE operation_id=$1 RETURNING ${projection}`, [operationId,receiptId]);
  return result.rows[0];
}

export async function findSubmission(pool:Pool, owner:{issuer:string;subject:string}, draftId:string):Promise<SubmissionRecord|null> {
  const result = await pool.query<SubmissionRecord>(`SELECT ${projection.split(', ').map(column => `s.${column}`).join(', ')} FROM draft_store.submissions s JOIN draft_store.drafts d ON d.id=s.draft_id WHERE d.id=$1 AND d.issuer=$2 AND d.subject=$3`, [draftId,owner.issuer,owner.subject]);
  return result.rows[0] ?? null;
}
