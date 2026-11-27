import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { HistoryRestores, RestoreNotDispatched, dispatchRestore, type RestoreAttempt, type RestoreAttemptStore } from '../src/features/editor/account/history-restores.js';

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

test('pre-dispatch cancellation retains an attempt another tab may have sent', async () => {
  const store = new MemoryStore(), sent:RestoreAttempt[] = []
  let release!:() => void, entered!:() => void
  const held = new Promise<void>(resolve => {release = resolve})
  const started = new Promise<void>(resolve => {entered = resolve})
  const first = new HistoryRestores(store,async () => {entered(); await held; throw new RestoreNotDispatched('stale')},()=> 'shared').restore('owner','draft','head','one')
  await started
  const second = new HistoryRestores(store,async attempt => {sent.push(attempt); throw Error('response lost')},()=> 'other').restore('owner','draft','head','one')
  await assert.rejects(second, /response lost/); release(); await assert.rejects(first, RestoreNotDispatched)
  const result = await new HistoryRestores(store,async attempt => {sent.push(attempt); return {draftId:attempt.draftId,versionId:'new',contentHash:'hash'}},()=> 'later').restore('owner','draft','head','two')
  assert.equal(sent[1].key,'shared'); assert.equal(result.matchesCurrent,false)
})

test('an edit during delayed header preparation prevents restore dispatch', async () => {
  let release!:() => void, entered!:() => void
  const blocked = new Promise<void>(resolve => {release = resolve})
  const started = new Promise<void>(resolve => {entered = resolve})
  let current = true, dispatches = 0
  const operation = dispatchRestore(async () => {entered(); await blocked; return {owner:'verified'}}, async () => true, () => current, async () => {dispatches++; return 'sent'})
  await started
  current = false; release()
  await assert.rejects(operation, RestoreNotDispatched)
  assert.equal(dispatches, 0)
})
