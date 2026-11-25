import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import pg from 'pg';
import { historyDatabaseConfig } from './support/history-fixture.js';

const url = 'postgresql://postgres:history@127.0.0.1:15435/history';
test('destructive history fixture accepts only the explicitly enabled dedicated loopback target', () => {
  const enabled = { HISTORY_DATABASE_URL: url, BIJUX_HISTORY_DISPOSABLE: 'bijux-history-postgres' };
  assert.equal(historyDatabaseConfig(enabled).host, '127.0.0.1');
  for (const value of [
    'postgresql://postgres:history@example.org:15435/history',
    'postgresql://postgres:history@localhost:15435/history',
    'postgresql://postgres:history@127.0.0.1:15433/history',
    `${url}?host=example.org`, `${url}?options=-csearch_path%3Dpublic`,
    'postgresql://postgres:history@127.0.0.1:15435/authoring',
  ]) assert.throws(() => historyDatabaseConfig({...enabled, HISTORY_DATABASE_URL:value}));
  assert.throws(() => historyDatabaseConfig({HISTORY_DATABASE_URL:url}));
  assert.throws(() => historyDatabaseConfig({...enabled, BIJUX_HISTORY_DISPOSABLE:'yes'}));
});

test('PostgreSQL environment variables cannot redirect the fixture connection', () => {
  const prior = {...process.env};
  try {
    Object.assign(process.env, {PGHOST:'remote.example', PGPORT:'5432', PGDATABASE:'other', PGUSER:'other', PGPASSWORD:'other', PGOPTIONS:'-c search_path=public', PGSSLMODE:'require'});
    const client = new pg.Client(historyDatabaseConfig({HISTORY_DATABASE_URL:url, BIJUX_HISTORY_DISPOSABLE:'bijux-history-postgres'}));
    assert.equal(client.host, '127.0.0.1');
    assert.equal(client.port, 15435);
    assert.equal(client.database, 'history');
    assert.equal(client.user, 'postgres');
    assert.equal(client.ssl, false);
  } finally {process.env = prior;}
});
