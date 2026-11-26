import {createWorkspace} from '@bijux/ro-crate-core'
import {decodeDraft, encodeDraft, encodeReadOnlyImport, inspectDraft, materializeDraft, type DraftDocument, type ImportResult, type MaterializeResult} from '@bijux/ro-crate-creator'
import {editableTermSlot, sameTermSlot, type PendingFile, type PendingTerm} from './pending.js'

// The creator backup already has a 64 MiB limit. The additional allowance holds
// up to 100,000 staged path records without admitting unbounded browser storage.
export const RECOVERY_MAX_BYTES = 80 * 1024 * 1024
export const RECOVERY_MAX_PENDING = 100_000
export const RECOVERY_MAX_PATH_BYTES = 4096
const encoder = new TextEncoder()
const wellFormed = (value:string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)
type ReadOnly = Extract<ImportResult, {status:'read-only'}>
type Input = ({readonly draft:DraftDocument} | {readonly readOnly:ReadOnly}) & {readonly pending:readonly PendingFile[]; readonly pendingTerms?:readonly PendingTerm[]}
export type RecoveryResult =
  | {readonly status:'decoded'; readonly draft:DraftDocument; readonly pending:readonly PendingFile[]; readonly pendingTerms:readonly PendingTerm[]; readonly materialization:MaterializeResult}
  | {readonly status:'read-only'; readonly files:ReadonlyMap<string, Uint8Array>; readonly excludedPaths:readonly string[]; readonly issues:readonly string[]; readonly pending:readonly PendingFile[]; readonly pendingTerms:readonly PendingTerm[]}
  | {readonly status:'rejected'; readonly issues:readonly string[]}

function pendingRows(value: unknown): PendingFile[] {
  if (!Array.isArray(value) || value.length > RECOVERY_MAX_PENDING) throw Error('Too many pending file listings')
  const ids = new Set<string>(), paths = new Set<string>()
  const rows: PendingFile[] = []
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).sort().join(',') !== 'id,path,size') throw Error('Invalid pending file listing')
    const {id, path, size} = row as Record<string, unknown>
    if (typeof id !== 'string' || !/^p:[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id.slice(2))) || ids.has(id)) throw Error('Invalid pending listing identifier')
    if (typeof path !== 'string' || !wellFormed(path) || !path || encoder.encode(path).length > RECOVERY_MAX_PATH_BYTES) throw Error('Invalid pending listing path')
    if (typeof size !== 'string' || !/^(0|[1-9][0-9]*)$/.test(size) || size.length > 4096) throw Error('Invalid pending listing size')
    ids.add(id); paths.add(path); rows.push({id,path,size})
  }
  const workspace = createWorkspace(new Map([...paths].map(path => [path, ''])))
  if ([...paths].some(path => workspace.resolveFile(path) !== path)) throw Error('Invalid pending listing path')
  return rows
}
function pendingTermRows(value:unknown):PendingTerm[] {
  if (!Array.isArray(value) || value.length > 1000) throw Error('Too many pending vocabulary entries')
  const terms:PendingTerm[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).sort().join(',') !== 'entityId,identifier,kind,label,previousId') throw Error('Invalid pending vocabulary entry')
    const {kind,entityId,previousId,identifier,label} = raw as Record<string,unknown>
    const validText = (item:unknown):item is string => typeof item === 'string'
    if ((kind !== 'taxonomy' && kind !== 'imaging') || !validText(entityId) || !entityId || !(previousId === null || validText(previousId) && !!previousId) || (kind === 'imaging' && previousId !== null) || !validText(identifier) || !validText(label)) throw Error('Invalid pending vocabulary entry')
    const term:PendingTerm = {kind,entityId,previousId,identifier,label}
    if (terms.some(item => sameTermSlot(item,term))) throw Error('Duplicate pending vocabulary entry')
    terms.push(term)
  }
  return terms
}
function bounded(text:string): void {
  if (!wellFormed(text) || text.length > RECOVERY_MAX_BYTES || encoder.encode(text).length > RECOVERY_MAX_BYTES) throw Error('Recovery backup exceeds the size limit or is invalid text')
}
export function encodeRecovery(input:Input): string {
  const pending = pendingRows(input.pending)
  const pendingTerms = pendingTermRows(input.pendingTerms ?? [])
  if ('readOnly' in input && pendingTerms.length) throw Error('Read-only recovery cannot contain pending vocabulary')
  if ('draft' in input && pendingTerms.length) {
    const view = inspectDraft(input.draft)
    if (pendingTerms.some(term => !editableTermSlot(view,term))) throw Error('Pending vocabulary does not identify an editable field')
  }
  const creator = 'draft' in input ? encodeDraft(input.draft) : encodeReadOnlyImport(input.readOnly)
  const text = pendingTerms.length ? `{"version":2,"creator":${creator},"pending":${JSON.stringify(pending)},"pendingTerms":${JSON.stringify(pendingTerms)}}` : `{"version":1,"creator":${creator},"pending":${JSON.stringify(pending)}}`
  bounded(text)
  return text
}
export async function decodeRecovery(text:string): Promise<RecoveryResult> {
  try {
    if (typeof text !== 'string') throw Error('Invalid recovery backup')
    bounded(text)
    const value: unknown = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid recovery envelope')
    const envelope = value as Record<string, unknown>
    const keys = Object.keys(envelope).sort().join(',')
    if (!((envelope.version === 1 && keys === 'creator,pending,version') || (envelope.version === 2 && keys === 'creator,pending,pendingTerms,version')) || JSON.stringify(value) !== text) throw Error('Unsupported or noncanonical recovery envelope')
    const pending = pendingRows(envelope.pending)
    const pendingTerms = envelope.version === 2 ? pendingTermRows(envelope.pendingTerms) : []
    const decoded = await decodeDraft(JSON.stringify(envelope.creator))
    if (decoded.status === 'rejected') return decoded
    if (decoded.status === 'read-only') {if (pendingTerms.length) throw Error('Read-only recovery cannot contain pending vocabulary'); return {...decoded, pending, pendingTerms}}
    const view = inspectDraft(decoded.draft)
    if (pendingTerms.some(term => !editableTermSlot(view,term))) throw Error('Pending vocabulary does not identify an editable field')
    const issues = [...(pending.length ? [{code:'pending-file-listings',message:'Assign or remove pending file listings before exporting metadata.'}] : []), ...(pendingTerms.length ? [{code:'pending-vocabulary',message:'Apply or discard pending vocabulary input before exporting metadata.'}] : [])]
    const materialization: MaterializeResult = issues.length ? {status:'blocked',revision:inspectDraft(decoded.draft).revision,issues} : materializeDraft(decoded.draft)
    return {status:'decoded',draft:decoded.draft,pending,pendingTerms,materialization}
  } catch (error) {return {status:'rejected',issues:[error instanceof Error ? error.message : 'Invalid recovery backup']}}
}
