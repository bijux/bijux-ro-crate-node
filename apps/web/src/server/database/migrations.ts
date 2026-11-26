import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { IDENTITY_SCHEMA } from './sql/identity.js';
import { DRAFT_SCHEMA } from './sql/schema.js';
import { HISTORY_SCHEMA } from './sql/history.js';
import { SUBMISSION_SCHEMA } from './sql/submission.js';

/** Applies the owned schema revision atomically and verifies its recorded migration history. */
export async function migrateDatabase(pool: Pool): Promise<void> {
  const migration = `${IDENTITY_SCHEMA}\n${DRAFT_SCHEMA}`;
  const checksum = createHash('sha256').update(migration).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('bijux-local-draft-schema'))");
    await client.query('CREATE SCHEMA IF NOT EXISTS draft_migrations');
    await client.query('CREATE TABLE IF NOT EXISTS draft_migrations.history (version integer PRIMARY KEY, checksum text NOT NULL)');
    const history = await client.query<{ version: number; checksum: string }>('SELECT version, checksum FROM draft_migrations.history');
    const historyChecksum = createHash('sha256').update(HISTORY_SCHEMA).digest('hex');
    const submissionChecksum = createHash('sha256').update(SUBMISSION_SCHEMA).digest('hex');
    if (history.rows.length === 0) {
      const existing = await client.query("SELECT nspname FROM pg_namespace WHERE nspname IN ('draft_store', 'draft_identity')");
      if (existing.rowCount) throw new Error('Unmanaged draft schemas already exist');
      await client.query(migration);
      await client.query('INSERT INTO draft_migrations.history (version, checksum) VALUES (1, $1)', [checksum]);
    } else if (history.rows.length > 3 || !history.rows.some(row => row.version === 1 && row.checksum === checksum) ||
      history.rows.some(row => row.version !== 1 && !(row.version === 2 && row.checksum === historyChecksum) && !(row.version === 3 && row.checksum === submissionChecksum))) {
      throw new Error('Unsupported migration history or migration checksum mismatch');
    }
    if (!history.rows.some(row => row.version === 2)) {
      await client.query(HISTORY_SCHEMA);
      await client.query('INSERT INTO draft_migrations.history (version, checksum) VALUES (2, $1)', [historyChecksum]);
    }
    if (!history.rows.some(row => row.version === 3)) {
      await client.query(SUBMISSION_SCHEMA);
      await client.query('INSERT INTO draft_migrations.history (version, checksum) VALUES (3, $1)', [submissionChecksum]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
