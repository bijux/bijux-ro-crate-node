import type { PoolConfig } from 'pg';

/** Destructive tests run only against the explicitly provisioned disposable fixture. */
export function historyDatabaseConfig(environment: NodeJS.ProcessEnv): PoolConfig {
  if (environment.BIJUX_HISTORY_DISPOSABLE !== 'bijux-history-postgres' ||
      environment.HISTORY_DATABASE_URL !== 'postgresql://postgres:history@127.0.0.1:15435/history') {
    throw Error('History tests require the explicitly enabled dedicated loopback fixture');
  }
  // Supplying individual parameters prevents URL query and libpq environment overrides.
  return { host:'127.0.0.1', port:15435, database:'history', user:'postgres', password:'history', ssl:false, options:'-c statement_timeout=0' };
}
