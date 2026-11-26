import { strict as assert } from 'node:assert';
import { test } from 'node:test';
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
  try {
    await pool.query('DROP SCHEMA IF EXISTS draft_store CASCADE; DROP SCHEMA IF EXISTS draft_identity CASCADE; DROP SCHEMA IF EXISTS draft_migrations CASCADE');
    await receiverPool.query('TRUNCATE reference_receiver.receipts');
    await migrateDatabase(pool);
    const row = (await pool.query("select * from draft_store.save('issuer','alice',null,null,'save','{}','{}')")).rows[0];
    const args = {owner:{issuer:'issuer',subject:'alice'},draftId:row.draft_id as string,versionId:row.version_id as string,contentHash:row.content_hash as string,qualificationDigest:'digest',requestKey:'submit',files:[{path:'ro-crate-metadata.json',base64:'e30='}]};
    const operation = await claimSubmission(pool,args);
    const lost = await dispatchSubmission(pool,operation,receiver.origin);
    assert.equal(lost.state,'uncertain');
    await pool.end(); await receiver.close();
    pool = new pg.Pool(config); receiver = await startReferenceReceiver(receiverPool,14525);
    const resumed = await claimSubmission(pool,args);
    const accepted = await dispatchSubmission(pool,resumed,receiver.origin);
    assert.equal(accepted.state,'accepted');
    assert.match(accepted.receiptId ?? '',/^local-reference-/);
    assert.equal((await receiverPool.query('select count(*)::int as count from reference_receiver.receipts')).rows[0].count,1);
    await assert.rejects(dispatchSubmission(pool,accepted,'http://example.com:14525'), /loopback/);
  } finally { await receiver.close(); await pool.end(); await receiverPool.end(); }
});
