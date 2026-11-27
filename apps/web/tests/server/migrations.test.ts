import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import pg from 'pg';
import { migrateDatabase } from '../../src/server/database/migrations.js';

const url = 'postgresql://authoring:local-reference-only@127.0.0.1:15433/authoring';
test('migration is transactional, repeatable and rejects altered checksums or unmanaged schemas', async () => {
  assert.equal(process.env.DRAFT_REFERENCE_DATABASE_CONTAINER, 'bijuxauthoringaccounts-database-1');
  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query('DROP SCHEMA IF EXISTS draft_store CASCADE; DROP SCHEMA IF EXISTS draft_identity CASCADE; DROP SCHEMA IF EXISTS draft_migrations CASCADE');
    await pool.query('CREATE SCHEMA draft_store');
    await assert.rejects(migrateDatabase(pool), /unmanaged/i);
    await pool.query('DROP SCHEMA draft_store');
    await migrateDatabase(pool);
    await migrateDatabase(pool);
    const applied = await pool.query('SELECT version FROM draft_migrations.history ORDER BY version');
    assert.deepEqual(applied.rows, [{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }]);
    await pool.query("UPDATE draft_migrations.history SET checksum = 'tampered'");
    await assert.rejects(migrateDatabase(pool), /checksum/i);
  } finally {
    await pool.query('DROP SCHEMA IF EXISTS draft_store CASCADE; DROP SCHEMA IF EXISTS draft_identity CASCADE; DROP SCHEMA IF EXISTS draft_migrations CASCADE');
    await pool.end();
  }
});
