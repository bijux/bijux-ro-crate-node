import { AccountRequestError, type SaveAttempt, type SavedDraft } from './saves'

export interface LocalIdentity { readonly issuer: string; readonly subject: string }
export interface LocalDraft { readonly draftId: string; readonly versionId: string; readonly savedAt: string }
async function json(response: Response): Promise<unknown> {
  if (!response.ok) throw new AccountRequestError(response.status)
  return response.json()
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export async function localSession(): Promise<LocalIdentity> {
  const value = await json(await fetch('api/local/session', {cache:'no-store'}))
  if (!record(value) || typeof value.issuer !== 'string' || typeof value.subject !== 'string') throw Error('Invalid local account response')
  return {issuer:value.issuer, subject:value.subject}
}
export async function ownerHeader(owner:string): Promise<Record<string,string>> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(owner)))
  return {'x-bijux-owner':Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}
}
export async function listLocalDrafts(owner:string, before:string | null = null): Promise<{drafts:LocalDraft[]; nextCursor:string | null}> {
  const value = await json(await fetch(`/api/local/drafts${before ? `?before=${encodeURIComponent(before)}` : ''}`, {cache:'no-store', headers:await ownerHeader(owner)}))
  if (!record(value) || !Array.isArray(value.drafts) || value.drafts.length > 100 || (value.nextCursor !== null && (typeof value.nextCursor !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.nextCursor)))) throw Error('Invalid local draft list')
  const drafts = value.drafts.map((item: unknown) => {
    if (!record(item) || typeof item.draftId !== 'string' || typeof item.versionId !== 'string' || typeof item.savedAt !== 'string') throw Error('Invalid local draft')
    return {draftId:item.draftId, versionId:item.versionId, savedAt:item.savedAt}
  })
  return {drafts, nextCursor:value.nextCursor as string | null}
}
export async function saveLocalDraft(attempt: SaveAttempt, owner:string): Promise<SavedDraft> {
  const value = await json(await fetch('/api/local/drafts', {
    method:'POST', headers:{'content-type':'application/json', ...await ownerHeader(owner)},
    body:JSON.stringify({key:attempt.key, recovery:JSON.parse(attempt.recovery), ...(attempt.draftId ? {draftId:attempt.draftId, expectedHead:attempt.expectedHead} : {})}),
  }))
  if (!record(value) || typeof value.draftId !== 'string' || typeof value.versionId !== 'string' || typeof value.contentHash !== 'string' || typeof value.savedAt !== 'string' || !Number.isFinite(Date.parse(value.savedAt))) throw Error('Invalid local save response')
  return {draftId:value.draftId, versionId:value.versionId, contentHash:value.contentHash, savedAt:value.savedAt}
}
export async function openLocalDraft(id: string, owner:string): Promise<{ versionId: string; savedAt: string; recovery: string }> {
  const value = await json(await fetch(`/api/local/drafts/${encodeURIComponent(id)}`, {cache:'no-store', headers:await ownerHeader(owner)}))
  if (!record(value) || typeof value.versionId !== 'string' || typeof value.savedAt !== 'string' || !Number.isFinite(Date.parse(value.savedAt)) || !record(value.recovery)) throw Error('Invalid local draft response')
  return {versionId:value.versionId, savedAt:value.savedAt, recovery:JSON.stringify(value.recovery)}
}
export async function logoutLocal(): Promise<void> {
  const response = await fetch('/api/local/auth/logout', {method:'POST'})
  if (!response.ok) throw new AccountRequestError(response.status)
}
