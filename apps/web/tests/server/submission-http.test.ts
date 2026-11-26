import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import pg from 'pg';
import { handleSubmissionRequest } from '../../src/server/submission/http.js';
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
    assert.equal((await call({key:'x',owner:JSON.stringify(['issuer','bob'])})).status,409);
    assert.equal((await call({key:'x',owner:JSON.stringify(['issuer','alice']),url:'http://example.com'})).status,400);
    assert.equal((await call({key:'x',owner:JSON.stringify(['issuer','bob'])},{issuer:'issuer',subject:'bob'})).status,404);
    assert.equal((await call({key:'x',owner:JSON.stringify(['issuer','alice'])})).status,422);
  } finally { await pool.end(); }
});
