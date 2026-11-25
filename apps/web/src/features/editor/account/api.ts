import { AccountRequestError, type SaveAttempt, type SavedDraft } from './saves'

export interface LocalIdentity { readonly issuer: string; readonly subject: string }
export interface LocalDraft { readonly draftId: string; readonly versionId: string; readonly savedAt: string }
async function json(response: Response): Promise<unknown> {
  if (!response.ok) throw new AccountRequestError(response.status)
  return response.json()
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export async function localSession(): Promise<LocalIdentity> {
  const value = await json(await fetch('/api/local/session', {cache:'no-store'}))
  if (!record(value) || typeof value.issuer !== 'string' || typeof value.subject !== 'string') throw Error('Invalid local account response')
  return {issuer:value.issuer, subject:value.subject}
}
export async function listLocalDrafts(): Promise<LocalDraft[]> {
  const value = await json(await fetch('/api/local/drafts', {cache:'no-store'}))
  if (!record(value) || !Array.isArray(value.drafts) || value.drafts.length > 100) throw Error('Invalid local draft list')
  return value.drafts.map((item: unknown) => {
    if (!record(item) || typeof item.draftId !== 'string' || typeof item.versionId !== 'string' || typeof item.savedAt !== 'string') throw Error('Invalid local draft')
    return {draftId:item.draftId, versionId:item.versionId, savedAt:item.savedAt}
  })
}
export async function saveLocalDraft(attempt: SaveAttempt): Promise<SavedDraft> {
  const value = await json(await fetch('/api/local/drafts', {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({key:attempt.key, recovery:JSON.parse(attempt.recovery), ...(attempt.draftId ? {draftId:attempt.draftId, expectedHead:attempt.expectedHead} : {})}),
  }))
  if (!record(value) || typeof value.draftId !== 'string' || typeof value.versionId !== 'string' || typeof value.contentHash !== 'string') throw Error('Invalid local save response')
  return {draftId:value.draftId, versionId:value.versionId, contentHash:value.contentHash}
}
export async function openLocalDraft(id: string): Promise<{ versionId: string; recovery: string }> {
  const value = await json(await fetch(`/api/local/drafts/${encodeURIComponent(id)}`, {cache:'no-store'}))
  if (!record(value) || typeof value.versionId !== 'string' || !record(value.recovery)) throw Error('Invalid local draft response')
  return {versionId:value.versionId, recovery:JSON.stringify(value.recovery)}
}
export async function logoutLocal(): Promise<void> {
  const response = await fetch('/api/local/auth/logout', {method:'POST'})
  if (!response.ok) throw new AccountRequestError(response.status)
}
