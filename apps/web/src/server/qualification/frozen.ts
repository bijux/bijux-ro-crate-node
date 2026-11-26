import {createWorkspace} from '@bijux/ro-crate-core'

export type FrozenSelectionResult = {status:'selected'; files:ReadonlyMap<string, Uint8Array>} | {status:'incomplete'; reason:string}
const incomplete = (reason:string): FrozenSelectionResult => ({status:'incomplete', reason})
const maxBytes = 16 * 1024 * 1024

/** Decode the stored export without regenerating it from the recovery payload. */
export function decodeFrozenSelection(payload:string, frozen:unknown):FrozenSelectionResult {
  let recovery:unknown
  try {recovery = JSON.parse(payload)} catch {return incomplete('Stored recovery is unavailable')}
  if (!recovery || typeof recovery !== 'object' || Array.isArray(recovery) || !Array.isArray((recovery as Record<string, unknown>).pending)) return incomplete('Stored recovery is unavailable')
  const envelope = recovery as Record<string, unknown>
  if (envelope.version !== 1 || !Object.hasOwn(envelope, 'creator') || Object.keys(envelope).sort().join(',') !== 'creator,pending,version') return incomplete('Stored recovery is unavailable')
  if (((recovery as {pending:unknown[]}).pending).length) return incomplete('Pending file listings must be resolved before validation')
  if (!frozen || typeof frozen !== 'object' || Array.isArray(frozen)) return incomplete('Frozen files are unavailable')
  const item = frozen as Record<string, unknown>
  if (!['materialized', 'read-only'].includes(String(item.status)) || !Array.isArray(item.files)) return incomplete('Frozen files are unavailable')
  if (item.files.length > 1024) return incomplete('Frozen file count exceeds the local limit')
  const files = new Map<string, Uint8Array>()
  let size = 0
  for (const value of item.files) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return incomplete('Invalid frozen file')
    const {path, base64} = value as Record<string, unknown>
    if (typeof base64 === 'string' && base64.length > Math.ceil(maxBytes / 3) * 4) return incomplete('Frozen files exceed the local input limit')
    if (typeof path !== 'string' || !path || Buffer.byteLength(path) > 4096 || path.includes('\\') || path.startsWith('/') ||
        typeof base64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64) || files.has(path)) return incomplete('Invalid frozen file')
    size += Buffer.byteLength(path) + Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)
    if (size > maxBytes) return incomplete('Frozen files exceed the local input limit')
    const bytes = Buffer.from(base64, 'base64')
    if (bytes.toString('base64') !== base64) return incomplete('Invalid frozen file')
    files.set(path, bytes)
  }
  try {
    const workspace = createWorkspace(files)
    if ([...files.keys()].some(path => workspace.resolveFile(path) !== path)) return incomplete('Invalid frozen file path')
  } catch {return incomplete('Invalid frozen file path')}
  return {status:'selected', files}
}
