import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AccountSaves, AccountRequestError, type SaveAttempt, type AttemptStore } from '../src/features/editor/account/saves.js';

class MemoryAttempts implements AttemptStore {
  records = new Map<string, SaveAttempt>();
  async peek(owner: string) { return this.records.get(owner); }
  async claim(owner: string, proposed: SaveAttempt) { const previous = this.records.get(owner); if (previous) return previous; this.records.set(owner, proposed); return proposed; }
  async finish(owner: string, key: string) { if (this.records.get(owner)?.key === key) this.records.delete(owner); }
}

test('a lost response retries the original key and snapshot after coordinator restart', async () => {
  const store = new MemoryAttempts();
  const sent: SaveAttempt[] = [];
  let lost = true;
  const send = async (attempt: SaveAttempt) => {
    sent.push(attempt);
    if (lost) { lost = false; throw Error('response lost'); }
    return { draftId: 'draft', versionId: 'version', contentHash: 'hash' };
  };
  await assert.rejects(new AccountSaves(store, send, () => 'stable-key').save('owner', '{"draft":"first"}', null));
  const resumed = new AccountSaves(store, send, () => 'new-key');
  const retry = await resumed.save('owner', '{"draft":"edited"}', null);
  assert.equal(sent[0].key, sent[1].key);
  assert.equal(sent[1].recovery, '{"draft":"first"}');
  assert.equal(retry.matchesCurrent, false);
  assert.equal(store.records.size, 1);
  await resumed.acknowledge('owner', retry.attemptKey);
  assert.equal(store.records.size, 0);
});

test('conflict discards only the confirmed failed attempt while expiry keeps it', async () => {
  const store = new MemoryAttempts();
  let status = 401;
  const saves = new AccountSaves(store, async () => { throw new AccountRequestError(status); }, () => 'key');
  await assert.rejects(saves.save('owner', '{}', null));
  assert.equal(store.records.size, 1);
  status = 409;
  await assert.rejects(saves.save('owner', '{}', null));
  assert.equal(store.records.size, 0);
});

test('a confirmed retry can reattach the same snapshot after session loss', async () => {
  const store = new MemoryAttempts();
  store.records.set('owner', { key:'saved-key', recovery:'{}', draftId:'draft', expectedHead:'old' });
  const saves = new AccountSaves(store, async () => ({draftId:'draft', versionId:'next', contentHash:'hash'}), () => 'unused');
  const resumed = await saves.save('owner', '{}', null, true);
  assert.equal(resumed.matchesCurrent, true);
  await saves.acknowledge('owner', resumed.attemptKey);
});
