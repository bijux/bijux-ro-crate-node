import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import pg from 'pg';
import { migrateDatabase } from '../../src/server/database/migrations.js';
import { claimSubmission } from '../../src/server/submission/store.js';

if (process.env.BIJUX_SUBMISSION_DISPOSABLE !== 'bijux-submission-postgres' || process.env.SUBMISSION_DATABASE_URL !== 'postgresql://postgres:reference@127.0.0.1:15440/reference') throw Error('Dedicated submission fixture required');
const pool = new pg.Pool({host:'127.0.0.1', port:15440, user:'postgres', password:'reference', database:'reference', ssl:false});

test('concurrent claims coalesce and cannot replace the immutable version', async () => {
  try {
    await pool.query('DROP SCHEMA IF EXISTS draft_store CASCADE; DROP SCHEMA IF EXISTS draft_identity CASCADE; DROP SCHEMA IF EXISTS draft_migrations CASCADE');
    await migrateDatabase(pool);
    await migrateDatabase(pool);
    assert.deepEqual((await pool.query('select version from draft_migrations.history order by version')).rows, [{version:1},{version:2},{version:3},{version:4}]);
    const saved = (await pool.query("select * from draft_store.save('issuer','alice',null,null,'save','{}','{}')")).rows[0];
    const owner = {issuer:'issuer', subject:'alice'};
    const args = { owner, draftId:saved.draft_id as string, versionId:saved.version_id as string, contentHash:saved.content_hash as string, qualificationDigest:'digest', requestKey:'first', destination:'http://127.0.0.1:14525', files:[{path:'ro-crate-metadata.json',base64:'e30='}] };
    const [a,b] = await Promise.all([claimSubmission(pool,args), claimSubmission(pool,{...args,requestKey:'other-tab'})]);
    assert.equal(a.operationId,b.operationId);
    assert.equal(a.payload,b.payload);
    assert.equal((await pool.query('select count(*)::int as count from draft_store.submissions')).rows[0].count,1);
    await assert.rejects(claimSubmission(pool,{...args, qualificationDigest:'changed'}), /conflict/);
    const other = (await pool.query("select * from draft_store.save('issuer','alice',null,null,'another','{}','{}')")).rows[0];
    await assert.rejects(claimSubmission(pool,{...args,draftId:other.draft_id,versionId:other.version_id,contentHash:other.content_hash}), /conflict/);
    await assert.rejects(claimSubmission(pool,{...args, owner:{...owner, subject:'bob'}}), /unavailable/);
    const oversized = Array.from({length:1024},(_,i) => ({path:`${i}-${'"'.repeat(4000)}`,base64:Buffer.alloc(12000).toString('base64')}));
    await assert.rejects(claimSubmission(pool,{...args,draftId:other.draft_id,versionId:other.version_id,contentHash:other.content_hash,requestKey:'oversized',files:oversized}), /payload too large/);
    assert.equal((await pool.query('select count(*)::int as count from draft_store.submissions')).rows[0].count,1);

  } finally { await pool.end(); }
});
