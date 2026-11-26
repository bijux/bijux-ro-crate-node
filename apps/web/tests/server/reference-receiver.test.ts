import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import pg from 'pg';
import { startReferenceReceiver } from './support/reference-receiver.js';

const config = {host: '127.0.0.1', port: 15441, user: 'postgres', password: 'reference', database: 'reference', ssl: false};
if (process.env.BIJUX_REFERENCE_DISPOSABLE !== 'bijux-reference-postgres' || process.env.REFERENCE_DATABASE_URL !== 'postgresql://postgres:reference@127.0.0.1:15441/reference') throw Error('Dedicated reference fixture required');

test('receiver persists one local receipt and rejects key reuse with different bytes', async () => {
  const pool = new pg.Pool(config);
  let receiver = await startReferenceReceiver(pool);
  try {
    await pool.query('TRUNCATE reference_receiver.receipts');
    const body = JSON.stringify({ operationKey: 'operation-one', files: [{path: 'ro-crate-metadata.json', base64: 'e30='}] });
    const post = (payload: string) => fetch(`${receiver.origin}/creates`, { method:'POST', headers:{'content-type':'application/json'}, body:payload });
    const first = await post(body);
    assert.equal(first.status, 201);
    const receipt = await first.json();
    assert.deepEqual(await (await post(body)).json(), receipt);
    assert.equal((await post(body.replace('e30=', 'W10='))).status, 409);
    await receiver.close();
    receiver = await startReferenceReceiver(pool);
    assert.deepEqual(await (await fetch(`${receiver.origin}/creates/operation-one`)).json(), receipt);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM reference_receiver.receipts')).rows[0].count, 1);
  } finally { await receiver.close(); await pool.end(); }
});
