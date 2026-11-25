export interface DraftBinding { readonly draftId: string; readonly versionId: string }
export interface SaveAttempt { readonly key: string; readonly recovery: string; readonly draftId?: string; readonly expectedHead?: string }
export interface SavedDraft extends DraftBinding { readonly contentHash: string }
export interface AttemptStore {
  peek(owner: string): Promise<SaveAttempt | undefined>;
  claim(owner: string, proposed: SaveAttempt): Promise<SaveAttempt>;
  finish(owner: string, key: string): Promise<void>;
}
export class AccountRequestError extends Error {
  constructor(readonly status: number) { super(`Local account request failed (${status})`); }
}

/** An unresolved attempt is retried exactly, even if the current draft changed. */
export class AccountSaves {
  constructor(private readonly store: AttemptStore, private readonly send: (attempt: SaveAttempt) => Promise<SavedDraft>, private readonly newKey: () => string) {}
  async save(owner: string, recovery: string, binding: DraftBinding | null): Promise<{ saved: SavedDraft; matchesCurrent: boolean }> {
    const proposed: SaveAttempt = { key: this.newKey(), recovery, ...(binding ? { draftId: binding.draftId, expectedHead: binding.versionId } : {}) };
    const attempt = await this.store.claim(owner, proposed);
    let saved: SavedDraft;
    try { saved = await this.send(attempt); }
    catch (error) {
      if (error instanceof AccountRequestError && [400, 404, 409, 413, 415].includes(error.status)) await this.store.finish(owner, attempt.key);
      throw error;
    }
    await this.store.finish(owner, attempt.key);
    return { saved, matchesCurrent: attempt.recovery === recovery && attempt.draftId === binding?.draftId && attempt.expectedHead === binding?.versionId };
  }
}
