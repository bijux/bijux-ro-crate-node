import {bssBase, type Environment} from './connectivity.js'

const maxResponseBytes = 1024 * 1024
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const bearer = /^[A-Za-z0-9._~-]{1,8192}$/

type Submission = {id:string; status:string; title:string | null; accessionId:string | null}
type Result = {kind:'ok'; submission:Submission} | {kind:'disabled' | 'misconfigured' | 'invalid-request' | 'unauthorized' | 'forbidden' | 'not-found' | 'unavailable' | 'invalid-response'}

/** Read a minimal submission projection; BSS remains the authority for access. */
export async function readSubmission(env:Environment, id:string, token:string, request:typeof fetch = fetch): Promise<Result> {
  if (!uuid.test(id) || !bearer.test(token)) return {kind:'invalid-request'}
  let base:URL | null
  try {base = bssBase(env)} catch {return {kind:'misconfigured'}}
  if (!base) return {kind:'disabled'}
  let response:Response
  try {
    response = await request(new URL(`submissions/${id}`, base), {headers:{authorization:`Bearer ${token}`}, redirect:'manual', cache:'no-store', signal:AbortSignal.timeout(3000)})
  } catch {return {kind:'unavailable'}}
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => {})
    return {kind:response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : response.status === 404 ? 'not-found' : 'unavailable'}
  }
  if (!/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') ?? '') || !response.body) {
    await response.body?.cancel().catch(() => {})
    return {kind:'invalid-response'}
  }
  const reader = response.body.getReader(), chunks:Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const {done, value} = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxResponseBytes) {await reader.cancel().catch(() => {}); return {kind:'invalid-response'}}
      chunks.push(value)
    }
  } catch {return {kind:'unavailable'}}
  finally {reader.releaseLock()}
  let value:unknown
  try {value = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(Buffer.concat(chunks)))} catch {return {kind:'invalid-response'}}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {kind:'invalid-response'}
  const item = value as Record<string, unknown>
  const title = item.title ?? null, accessionId = item.accession_id ?? null
  if (typeof item.id !== 'string' || item.id.toLowerCase() !== id.toLowerCase() || typeof item.status !== 'string' || !item.status ||
      !(title === null || typeof title === 'string') || !(accessionId === null || typeof accessionId === 'string')) return {kind:'invalid-response'}
  return {kind:'ok', submission:{id:item.id, status:item.status, title, accessionId}}
}
