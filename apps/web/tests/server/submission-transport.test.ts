import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import pg from 'pg';
import { migrateDatabase } from '../../src/server/database/migrations.js';
import { claimSubmission } from '../../src/server/submission/store.js';
import { dispatchSubmission } from '../../src/server/submission/transport.js';
import { startReferenceReceiver } from './support/reference-receiver.js';
if (process.env.BIJUX_SUBMISSION_DISPOSABLE !== 'bijux-submission-postgres' || process.env.SUBMISSION_DATABASE_URL !== 'postgresql://postgres:reference@127.0.0.1:15440/reference' || process.env.BIJUX_REFERENCE_DISPOSABLE !== 'bijux-reference-postgres' || process.env.REFERENCE_DATABASE_URL !== 'postgresql://postgres:reference@127.0.0.1:15441/reference') throw Error('Dedicated submission and receiver fixtures required');
const config = {host:'127.0.0.1',port:15440,user:'postgres',password:'reference',database:'reference',ssl:false};
const receiverPool = new pg.Pool({...config,port:15441});

test('a lost receiver response is reconciled using the original durable key', async () => {
  let pool = new pg.Pool(config);
  let receiver = await startReferenceReceiver(receiverPool, 14525, {loseFirstResponse:true});
  let requests = 0; const other = createServer((_request,response) => {requests++; response.writeHead(500); response.end()});
  other.listen(0,'127.0.0.1'); await once(other,'listening');
  const address=other.address(); if (!address || typeof address === 'string') throw Error('fixture bind');
  const differentOrigin=`http://127.0.0.1:${address.port}`;
  try {
    await pool.query('DROP SCHEMA IF EXISTS draft_store CASCADE; DROP SCHEMA IF EXISTS draft_identity CASCADE; DROP SCHEMA IF EXISTS draft_migrations CASCADE');
    await receiverPool.query('TRUNCATE reference_receiver.receipts');
    await migrateDatabase(pool);
    const row = (await pool.query("select * from draft_store.save('issuer','alice',null,null,'save','{}','{}')")).rows[0];
    const args = {owner:{issuer:'issuer',subject:'alice'},draftId:row.draft_id as string,versionId:row.version_id as string,contentHash:row.content_hash as string,qualificationDigest:'digest',requestKey:'submit',destination:receiver.origin,files:[{path:'ro-crate-metadata.json',base64:'e30='}]};
    const operation = await claimSubmission(pool,args);
    assert.equal(operation.receiverOrigin,receiver.origin);
    assert.equal((await claimSubmission(pool,{...args,destination:`${receiver.origin}/`})).operationId,operation.operationId);
    for (const destination of ['http://example.com:14525','http://127.1:14525','http://user@127.0.0.1:14525','http://127.0.0.1:14525/path'])
      await assert.rejects(claimSubmission(pool,{...args,destination}), /loopback/);
    const lost = await dispatchSubmission(pool,operation,receiver.origin);
    assert.equal(lost.state,'uncertain');
    await assert.rejects(claimSubmission(pool,{...args,destination:differentOrigin}), /receiver.*mismatch/i);
    await assert.rejects(claimSubmission(pool,{...args,requestKey:'other-key',destination:differentOrigin}), /receiver.*mismatch/i);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM draft_store.submission_requests')).rows[0].count,1);
    await assert.rejects(dispatchSubmission(pool,lost,differentOrigin), /receiver.*mismatch/i);
    assert.equal(requests,0);
    const retained = await pool.query<{state:string;payload:string}>('SELECT state,payload FROM draft_store.submissions WHERE operation_id=$1',[operation.operationId]);
    assert.equal(retained.rows[0].state,'uncertain'); assert.equal(retained.rows[0].payload,operation.payload);
    await pool.end(); await receiver.close();
    pool = new pg.Pool(config); receiver = await startReferenceReceiver(receiverPool,14525);
    const resumed = await claimSubmission(pool,args);
    const accepted = await dispatchSubmission(pool,resumed,receiver.origin);
    assert.equal(accepted.state,'accepted');
    assert.match(accepted.receiptId ?? '',/^local-reference-/);
    assert.equal((await receiverPool.query('select count(*)::int as count from reference_receiver.receipts')).rows[0].count,1);
    await receiverPool.query("update reference_receiver.receipts set receipt_id='local-reference-00000000-0000-0000-0000-000000000000'");
    const inconsistent = await dispatchSubmission(pool,accepted,receiver.origin);
    assert.equal(inconsistent.state,'accepted'); assert.equal(inconsistent.receiptId,accepted.receiptId); assert.equal(inconsistent.observation,'unavailable');
    await receiver.close();
    const unavailable = await dispatchSubmission(pool,accepted,receiver.origin);
    assert.equal(unavailable.state,'accepted');
    assert.equal(unavailable.observation,'unavailable');
    assert.equal(unavailable.lastObservedAt?.getTime(),accepted.lastObservedAt?.getTime());
    receiver = await startReferenceReceiver(receiverPool,14525);
    await assert.rejects(dispatchSubmission(pool,accepted,'http://example.com:14525'), /loopback/);
  } finally { try { await receiver.close(); } catch {} await new Promise<void>((resolve,reject) => other.close(error => error ? reject(error) : resolve())); await pool.end(); await receiverPool.end(); }
});
