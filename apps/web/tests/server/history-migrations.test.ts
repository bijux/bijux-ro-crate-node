import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import pg from 'pg';
import { migrateDatabase } from '../../src/server/database/migrations.js';
import { historyDatabaseConfig } from './support/history-fixture.js';
import { IDENTITY_SCHEMA } from '../../src/server/database/sql/identity.js';
import { DRAFT_SCHEMA } from '../../src/server/database/sql/schema.js';

const databaseConfig = historyDatabaseConfig(process.env);
const pool = new pg.Pool(databaseConfig);
const clear = () => pool.query('DROP SCHEMA IF EXISTS draft_store CASCADE; DROP SCHEMA IF EXISTS draft_identity CASCADE; DROP SCHEMA IF EXISTS draft_migrations CASCADE');
test('migration installs fresh, upgrades the accepted schema, repeats and rejects drift', async () => {
  try {
    await clear();
    await migrateDatabase(pool);
    await migrateDatabase(pool);
    assert.deepEqual((await pool.query('select version from draft_migrations.history order by version')).rows, [{version: 1}, {version: 2}]);
    await pool.query("update draft_migrations.history set checksum = 'changed' where version = 2");
    await assert.rejects(migrateDatabase(pool), /checksum/);
    await clear();
    const original = `${IDENTITY_SCHEMA}\n${DRAFT_SCHEMA}`;
    await pool.query('create schema draft_migrations; create table draft_migrations.history (version integer primary key, checksum text not null)');
    await pool.query(original);
    await pool.query('insert into draft_migrations.history values (1, $1)', [createHash('sha256').update(original).digest('hex')]);
    await pool.query("select * from draft_store.save('issuer', 'subject', null, null, 'original', '{}', '{}'::jsonb)");
    await migrateDatabase(pool);
    assert.equal((await pool.query('select count(*)::int as count from draft_store.versions')).rows[0].count, 1);
    await migrateDatabase(pool);
    await pool.query("update draft_migrations.history set checksum = 'changed' where version = 1");
    await assert.rejects(migrateDatabase(pool), /checksum/);
  } finally { await clear(); await pool.end(); }
});
