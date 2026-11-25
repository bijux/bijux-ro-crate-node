import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { HistoryRestores, type RestoreAttempt, type RestoreAttemptStore } from '../src/features/editor/account/history-restores.js';

class MemoryStore implements RestoreAttemptStore {
  private attempts = new Map<string, RestoreAttempt>();
  async claim(owner:string, attempt:RestoreAttempt) { const previous = this.attempts.get(owner); if (previous) return previous; this.attempts.set(owner, attempt); return attempt; }
  async finish(owner:string, key:string) { if (this.attempts.get(owner)?.key === key) this.attempts.delete(owner); }
}
test('restore retries the identical source and head after a lost response', async () => {
  const store = new MemoryStore(), sent: RestoreAttempt[] = [];
  let lost = true;
  const send = async (attempt:RestoreAttempt) => { sent.push(attempt); if (lost) {lost = false; throw Error('lost');} return {draftId:attempt.draftId, versionId:'new', contentHash:'hash'}; };
  await assert.rejects(new HistoryRestores(store, send, () => 'one').restore('owner', 'draft', 'head', 'first'));
  const result = await new HistoryRestores(store, send, () => 'two').restore('owner', 'draft', 'head', 'second');
  assert.deepEqual(sent[1], sent[0]);
  assert.equal(result.matchesCurrent, false);
});
