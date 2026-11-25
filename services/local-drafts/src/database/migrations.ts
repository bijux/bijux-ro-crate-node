import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { RECOVERY_MAX_BYTES } from '../../../../apps/web/src/drafts/recovery-codec.js';

/** Installs the one owned schema revision atomically and rejects unknown layouts. */
export async function migrateDatabase(pool: Pool): Promise<void> {
  const identity = await readFile(new URL('../../db/identity.sql', import.meta.url), 'utf8');
  const drafts = (await readFile(new URL('../../db/schema.sql', import.meta.url), 'utf8'))
    .replaceAll('__RECOVERY_MAX_BYTES__', String(RECOVERY_MAX_BYTES));
  const migration = `${identity}\n${drafts}`;
  const checksum = createHash('sha256').update(migration).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('bijux-local-draft-schema'))");
    await client.query('CREATE SCHEMA IF NOT EXISTS draft_migrations');
    await client.query('CREATE TABLE IF NOT EXISTS draft_migrations.history (version integer PRIMARY KEY, checksum text NOT NULL)');
    const history = await client.query<{ version: number; checksum: string }>('SELECT version, checksum FROM draft_migrations.history');
    if (history.rows.length === 0) {
      const existing = await client.query("SELECT nspname FROM pg_namespace WHERE nspname IN ('draft_store', 'draft_identity')");
      if (existing.rowCount) throw new Error('Unmanaged draft schemas already exist');
      await client.query(migration);
      await client.query('INSERT INTO draft_migrations.history (version, checksum) VALUES (1, $1)', [checksum]);
    } else if (history.rows.length !== 1 || history.rows[0].version !== 1 || history.rows[0].checksum !== checksum) {
      throw new Error('Unsupported migration history or migration checksum mismatch');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
