import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import pg from 'pg';
import { handleSubmissionRequest } from '../../src/server/submission/http.js';
import { claimSubmission, recordObservation } from '../../src/server/submission/store.js';
import { migrateDatabase } from '../../src/server/database/migrations.js';
if (process.env.BIJUX_SUBMISSION_DISPOSABLE !== 'bijux-submission-postgres' || process.env.SUBMISSION_DATABASE_URL !== 'postgresql://postgres:reference@127.0.0.1:15440/reference') throw Error('Dedicated submission fixture required');
const pool = new pg.Pool({host:'127.0.0.1',port:15440,user:'postgres',password:'reference',database:'reference',ssl:false});
const origin = new URL('http://127.0.0.1:14325'), alice={issuer:'issuer',subject:'alice'};
test('submission checks owner and rejects client-selected destinations or mismatched sessions', async () => {
  try {
    await pool.query('DROP SCHEMA IF EXISTS draft_store CASCADE; DROP SCHEMA IF EXISTS draft_identity CASCADE; DROP SCHEMA IF EXISTS draft_migrations CASCADE'); await migrateDatabase(pool);
    const saved=(await pool.query("select * from draft_store.save('issuer','alice',null,null,'save','{}','{}')")).rows[0];
    const url=new URL(`/api/local/drafts/${saved.draft_id}/versions/${saved.version_id}/submission`,origin);
    const call=(body:object, owner=alice) => handleSubmissionRequest(new Request(url,{method:'POST',headers:{origin:origin.origin,'content-type':'application/json'},body:JSON.stringify(body)}),url,origin,pool,owner,'http://127.0.0.1:14525');
    const mismatch = await call({key:'x',owner:JSON.stringify(['issuer','bob'])});
    assert.equal(mismatch.status,409); assert.deepEqual(await mismatch.json(),{error:'owner-mismatch'});
    assert.equal((await call({key:'x',owner:JSON.stringify(['issuer','alice']),url:'http://example.com'})).status,400);
    assert.equal((await call({key:'x',owner:JSON.stringify(['issuer','bob'])},{issuer:'issuer',subject:'bob'})).status,404);
    assert.equal((await call({key:'x',owner:JSON.stringify(['issuer','alice'])})).status,422);
    const operation = await claimSubmission(pool,{owner:alice,draftId:saved.draft_id,versionId:saved.version_id,contentHash:saved.content_hash,qualificationDigest:'digest',requestKey:'claim',files:[{path:'ro-crate-metadata.json',base64:'e30='}]});
    await recordObservation(pool,operation.operationId,'local-reference-00000000-0000-0000-0000-000000000001');
    const collection = new URL('/api/local/submissions',origin);
    const list = async (owner=alice) => await (await handleSubmissionRequest(new Request(collection),collection,origin,pool,owner)).json() as {owner:string; operations:Array<{draftId:string;operationId:string}>};
    assert.equal((await list()).owner,JSON.stringify(['issuer','alice']));
    assert.deepEqual((await list()).operations.map(item => item.draftId),[saved.draft_id]);
    assert.deepEqual((await list({issuer:'issuer',subject:'bob'})).operations,[]);
    const reconcile = new URL(`/api/local/drafts/${saved.draft_id}/submission/reconcile`,origin);
    const request = (owner:string) => new Request(reconcile,{method:'POST',headers:{origin:origin.origin,'content-type':'application/json'},body:JSON.stringify({owner})});
    assert.equal((await handleSubmissionRequest(request(JSON.stringify(['issuer','bob'])),reconcile,origin,pool,{issuer:'issuer',subject:'bob'},'http://127.0.0.1:14525')).status,404);
    const observed = await (await handleSubmissionRequest(request(JSON.stringify(['issuer','alice'])),reconcile,origin,pool,alice,'http://127.0.0.1:14525')).json() as {operation:{state:string;receiptId:string;observation:string}};
    assert.equal(observed.operation.state,'accepted'); assert.equal(observed.operation.receiptId,'local-reference-00000000-0000-0000-0000-000000000001'); assert.equal(observed.operation.observation,'unavailable');

  } finally { await pool.end(); }
});
