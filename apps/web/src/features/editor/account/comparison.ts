import {inspectDraft} from '@bijux/ro-crate-creator'
import type {RecoveryResult} from '../../../drafts/recovery-codec.js'

export const MAX_COMPARISON_ITEMS = 12
export type RecoveryComparison = {readonly status:'unavailable'; readonly reason:string} | {
  readonly status:'compared'; readonly study:readonly string[]; readonly records:readonly string[]; readonly recordsOmitted:number;
  readonly files:readonly string[]; readonly filesOmitted:number; readonly pending:readonly string[]; readonly pendingOmitted:number;
  readonly additionalPending:boolean
}
const short = (value:unknown) => {
  const text = typeof value === 'string' ? value : value == null ? '(empty)' : JSON.stringify(value)
  return text.length > 160 ? text.slice(0, 157) + '…' : text
}
function changes<T>(before:readonly T[], after:readonly T[], key:(value:T)=>string, label:(value:T)=>string) {
  const previous = new Map(before.map(value => [key(value),value])), next = new Map(after.map(value => [key(value),value]))
  const lines:string[] = []
  let count = 0
  const add = (line:string) => {count++; if (lines.length < MAX_COMPARISON_ITEMS) lines.push(line)}
  for (const [id, value] of previous) {
    const other = next.get(id)
    if (!other) add(`Removed ${label(value)}`)
    else if (JSON.stringify(value) !== JSON.stringify(other)) {
      const oldFields = value as Record<string, unknown>, newFields = other as Record<string, unknown>
      const fields = [...new Set([...Object.keys(oldFields), ...Object.keys(newFields)])]
        .filter(field => JSON.stringify(oldFields[field]) !== JSON.stringify(newFields[field])).slice(0, 8)
      const beforeLabel = label(value), afterLabel = label(other)
      add(`Changed ${beforeLabel === afterLabel ? afterLabel : `${beforeLabel} → ${afterLabel}`}${fields.length ? ` (${fields.join(', ')})` : ''}`)
    }
  }
  for (const [id, value] of next) if (!previous.has(id)) add(`Added ${label(value)}`)
  return {lines, omitted:count - lines.length}
}

/** Summarize editable content; full backups retain opaque and undisplayed values. */
export function compareRecoveries(before:RecoveryResult, after:RecoveryResult): RecoveryComparison {
  if (before.status !== 'decoded' || after.status !== 'decoded') return {status:'unavailable', reason:'A read-only or invalid recovery cannot be compared as an editable draft. Download its full backup.'}
  const left = inspectDraft(before.draft), right = inspectDraft(after.draft)
  const study:string[] = []
  for (const [field, label] of [['name','Study title'], ['description','Description'], ['license','License'], ['fundingStatement','Funding statement']] as const) {
    const oldValue = left.study?.[field], newValue = right.study?.[field]
    if (oldValue !== newValue) study.push(`${label}: ${short(oldValue)} → ${short(newValue)}`)
  }
  if (!!left.study !== !!right.study) study.unshift(right.study ? 'Study added' : 'Study removed')
  const records = changes(left.entities, right.entities, value => value.id, value => `${value.kind} ${short(value.name ?? value.label ?? value.id)} (${short(value.id)})`)
  const files = changes(left.files, right.files, value => value.path, value => `file ${short(value.path)}`)
  const pending = changes(before.pending, after.pending, value => value.id, value => `pending file ${short(value.path)} (${short(value.size)} bytes)`)
  const additionalPending = [before, after].some(value => Object.entries(value).some(([key, item]) => key.startsWith('pending') && key !== 'pending' && (!Array.isArray(item) || item.length > 0)))
  return {status:'compared', study, records:records.lines, recordsOmitted:records.omitted, files:files.lines, filesOmitted:files.omitted,
    pending:pending.lines, pendingOmitted:pending.omitted, additionalPending}
}

import {decodeRecovery} from '../../../drafts/recovery-codec.js'
import type {SaveAttempt} from './saves.js'

export class StaleComparisonError extends Error {
  constructor() {super('The account or editor changed during comparison')}
}
export interface ConfirmedHead {readonly versionId:string; readonly savedAt:string; readonly recovery:string}
export interface AttemptComparison {
  readonly attempt:SaveAttempt; readonly currentBackup:string; readonly retained:RecoveryResult; readonly current:RecoveryResult
  readonly head?:ConfirmedHead & {readonly decoded:RecoveryResult}
  readonly currentChanges:RecoveryComparison; readonly headChanges?:RecoveryComparison
}

/** Resolve only while the captured account and editor input are still current. */
export async function compareAttempt(input:{attempt:SaveAttempt; currentBackup:string; fetchHead(id:string):Promise<ConfirmedHead>;
  confirmOwner():Promise<boolean>; isCurrent():boolean}): Promise<AttemptComparison> {
  const check = () => {if (!input.isCurrent()) throw new StaleComparisonError()}
  check()
  const [retained, current] = await Promise.all([decodeRecovery(input.attempt.recovery), decodeRecovery(input.currentBackup)])
  check()
  if (retained.status === 'rejected' || current.status === 'rejected') throw Error('A recovery could not be decoded')
  let head:(ConfirmedHead & {decoded:RecoveryResult}) | undefined
  if (input.attempt.draftId) {
    const saved = await input.fetchHead(input.attempt.draftId)
    check()
    const decoded = await decodeRecovery(saved.recovery)
    check()
    if (decoded.status === 'rejected') throw Error('The saved recovery could not be decoded')
    head = {...saved,decoded}
  }
  if (!await input.confirmOwner()) throw new StaleComparisonError()
  check()
  return {attempt:input.attempt,currentBackup:input.currentBackup,retained,current,...(head ? {head} : {}),
    currentChanges:compareRecoveries(retained,current),...(head ? {headChanges:compareRecoveries(retained,head.decoded)} : {})}
}
