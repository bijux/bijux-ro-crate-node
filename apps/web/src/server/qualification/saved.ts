import type {Pool} from 'pg'
import {decodeFrozenSelection} from './frozen.js'
import {localPolicy, type Qualification} from './index.js'
import {localQualificationPool} from './runtime.js'

/** Qualify only a version loaded under the authenticated owner's draft. */
export async function qualifySavedVersion(database:Pool, owner:{issuer:string; subject:string}, draftId:string, versionId:string, signal?:AbortSignal):Promise<Qualification | null> {
  const result = await database.query<{id:string; payload:string; frozen:unknown; content_hash:string}>(
    `SELECT v.id, v.payload, v.frozen, v.content_hash FROM draft_store.drafts d JOIN draft_store.versions v ON v.draft_id = d.id
     WHERE d.id = $1 AND d.issuer = $2 AND d.subject = $3 AND v.id = $4`, [draftId, owner.issuer, owner.subject, versionId])
  if (!result.rowCount) return null
  const saved = result.rows[0], version = {versionId:saved.id, contentHash:saved.content_hash}
  const selection = decodeFrozenSelection(saved.payload, saved.frozen)
  if (selection.status === 'incomplete') return {policy:localPolicy, version, digest:'', status:'incomplete', reason:selection.reason}
  return localQualificationPool().qualify({version, files:selection.files}, signal)
}
