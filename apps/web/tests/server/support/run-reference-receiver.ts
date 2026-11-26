import pg from 'pg';
import {startReferenceReceiver} from './reference-receiver.js';
if (process.env.BIJUX_REFERENCE_DISPOSABLE !== 'bijux-reference-postgres' || process.env.REFERENCE_DATABASE_URL !== 'postgresql://postgres:reference@127.0.0.1:15441/reference') throw Error('Dedicated reference receiver database required');
const pool = new pg.Pool({host:'127.0.0.1',port:15441,user:'postgres',password:'reference',database:'reference',ssl:false});
const receiver = await startReferenceReceiver(pool,14525);
console.log(`Local reference receiver fixture: ${receiver.origin}`);
for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal, () => { void receiver.close().then(() => pool.end()); });
