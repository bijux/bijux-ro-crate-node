import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { RECOVERY_MAX_BYTES } from '../../../apps/web/src/drafts/recovery-codec.js';

const docker = process.env.DOCKER ?? 'docker';
function testContainer(): string {
  const name = process.env.DRAFT_TEST_POSTGRES;
  if (!name?.startsWith('bijuxauthoring-accounts-test-')) throw new Error('DRAFT_TEST_POSTGRES must name a dedicated test container');
  return name;
}
const container = testContainer();
function sql(query: string): string {
  return execFileSync(docker, ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'drafts', '-v', 'ON_ERROR_STOP=1', '-At'], { input: query, encoding: 'utf8' }).trim();
}

test('persisted revisions enforce ownership, compare-and-swap and idempotency', () => {
  sql('DROP SCHEMA IF EXISTS draft_store CASCADE');
  sql(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8').replaceAll('__RECOVERY_MAX_BYTES__', String(RECOVERY_MAX_BYTES)));
  const save = (owner: string, draft: string, head: string, key: string, content: string) =>
    sql(`select row_to_json(r) from draft_store.save('issuer', '${owner}', ${draft}, ${head}, '${key}', '${content}', '{}'::jsonb) r`);
  const first = JSON.parse(save('alice', 'null', 'null', 'first', 'original'));
  assert.equal(first.content_hash, createHash('sha256').update('original').digest('hex'));
  assert.deepEqual(JSON.parse(save('alice', 'null', 'null', 'first', 'original')), first);
  assert.throws(() => save('alice', 'null', 'null', 'first', 'different'));
  assert.throws(() => save('bob', `'${first.draft_id}'`, `'${first.version_id}'`, 'bob', 'stolen'));
  const next = JSON.parse(save('alice', `'${first.draft_id}'`, `'${first.version_id}'`, 'next', 'updated'));
  assert.throws(() => save('alice', `'${first.draft_id}'`, `'${first.version_id}'`, 'stale', 'retained by client'));
  assert.equal(sql(`select payload from draft_store.versions where id = '${first.version_id}'`), 'original');
  assert.throws(() => sql(`update draft_store.versions set payload = 'changed' where id = '${first.version_id}'`));
  assert.throws(() => sql(`delete from draft_store.versions where id = '${first.version_id}'`));
  assert.equal(sql(`select head_id from draft_store.drafts where id = '${first.draft_id}'`), next.version_id);
  execFileSync(docker, ['restart', container]);
  for (let attempt = 0; ; attempt++) {
    try { sql('select 1'); break; } catch (error) { if (attempt === 30) throw error; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200); }
  }
  assert.equal(sql(`select payload from draft_store.versions where id = '${next.version_id}'`), 'updated');
});

// Competing writes run in separate database sessions against the same head.
test('concurrent updates admit exactly one writer', async () => {
  const initial = JSON.parse(sql("select row_to_json(r) from draft_store.save('issuer', 'race', null, null, 'initial', 'base', '{}'::jsonb) r"));
  const write = (key: string) => new Promise<number | null>((resolve) => {
    const child = spawn(docker, ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'drafts', '-v', 'ON_ERROR_STOP=1', '-At'], { stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('close', resolve);
    child.stdin.end(`select * from draft_store.save('issuer', 'race', '${initial.draft_id}', '${initial.version_id}', '${key}', '${key}', '{}'::jsonb)`);
  });
  const outcomes = await Promise.all([write('left'), write('right')]);
  assert.equal(outcomes.filter((status) => status === 0).length, 1);
  assert.equal(sql(`select count(*) from draft_store.versions where draft_id = '${initial.draft_id}'`), '2');
});
