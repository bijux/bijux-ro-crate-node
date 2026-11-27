import assert from 'node:assert/strict'
import {createHash, randomBytes} from 'node:crypto'
import test from 'node:test'
import pg from 'pg'
import {migrateDatabase} from '../../src/server/database/migrations.js'
import {IDENTITY_SCHEMA} from '../../src/server/database/sql/identity.js'
import {DRAFT_SCHEMA} from '../../src/server/database/sql/schema.js'
import {HISTORY_SCHEMA} from '../../src/server/database/sql/history.js'
import {SUBMISSION_SCHEMA} from '../../src/server/database/sql/submission.js'

test('identity label migration preserves existing sessions and migration history', async () => {
  const name = `bijux_label_${randomBytes(8).toString('hex')}`
  const admin = new pg.Pool({connectionString:'postgresql://authoring:local-reference-only@127.0.0.1:15433/authoring'})
  const sum = (value:string) => createHash('sha256').update(value).digest('hex')
  let pool:pg.Pool | undefined
  try {
    await admin.query(`CREATE DATABASE "${name}"`)
    pool = new pg.Pool({connectionString:`postgresql://authoring:local-reference-only@127.0.0.1:15433/${name}`})
    const first = `${IDENTITY_SCHEMA}\n${DRAFT_SCHEMA}`
    await pool.query(first); await pool.query(HISTORY_SCHEMA); await pool.query(SUBMISSION_SCHEMA)
    await pool.query('CREATE SCHEMA draft_migrations; CREATE TABLE draft_migrations.history (version integer PRIMARY KEY, checksum text NOT NULL)')
    await pool.query('INSERT INTO draft_migrations.history VALUES (1,$1),(2,$2),(3,$3)', [sum(first),sum(HISTORY_SCHEMA),sum(SUBMISSION_SCHEMA)])
    await pool.query("INSERT INTO draft_identity.sessions VALUES ('legacy','issuer','subject', now() + interval '1 hour')")
    await migrateDatabase(pool); await migrateDatabase(pool)
    const sessions = await pool.query('SELECT issuer,subject,preferred_username FROM draft_identity.sessions WHERE token_hash=$1',['legacy'])
    assert.deepEqual(sessions.rows,[{issuer:'issuer',subject:'subject',preferred_username:null}])
    assert.deepEqual((await pool.query('SELECT version FROM draft_migrations.history ORDER BY version')).rows.map(row => row.version),[1,2,3,4])
  } finally {
    await pool?.end()
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`)
    await admin.end()
  }
})
